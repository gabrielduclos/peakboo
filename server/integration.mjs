// Isolated, disposable PostgreSQL. Never connects to a user's hosted database.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "peakboo-test-"));
const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(dir, "db"),
  user: "postgres",
  password,
  port: 55442,
  persistent: false,
  postgresFlags: ["-c", "unix_socket_directories="],
  autoRehydrateSymlinks: true,
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});
let server, client;
let checks = 0;
try {
  console.log("Starting isolated PostgreSQL…");
  await postgres.initialise();
  console.log("Cluster ready");
  await postgres.start();
  console.log("Database ready");
  server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:55442/postgres`,
      BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
      BETTER_AUTH_URL: "http://localhost:3001",
      FRONTEND_ORIGINS: "http://127.0.0.1:4173,http://localhost:3001",
      PORT: "3001",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  server.stderr.on("data", (d) => (errors += d.toString()));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server did not start: " + errors)),
      15000,
    );
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Peakboo ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("Server exited " + code + ": " + errors));
    });
  });
  const call = async (route, token, method = "GET", body) => {
    const res = await fetch("http://localhost:3001" + route, {
      method,
      headers: {
        Origin: "http://localhost:3001",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      token: res.headers.get("set-auth-token"),
      data: await res.json(),
    };
  };
  const check = (description, fn) => {
    fn();
    checks++;
    console.log("PASS " + description);
  };
  const anonymous = await call("/api/bootstrap");
  check("anonymous requests rejected", () =>
    assert.equal(anonymous.status, 401),
  );
  const users = [];
  for (const name of ["Alice", "Bob", "Charlie"]) {
    const user = await call("/api/auth/sign-up/email", null, "POST", {
      name,
      email: name.toLowerCase() + "@peakboo-test.invalid",
      password: "test-password-" + randomBytes(10).toString("hex"),
    });
    assert.equal(user.status, 200, JSON.stringify(user.data));
    assert.ok(user.token);
    users.push(user);
  }
  const [alice, bob, charlie] = users;
  check("Better Auth registration returns signed bearer sessions", () =>
    assert.ok(alice.token && bob.token && charlie.token),
  );
  const short = await call("/api/auth/sign-up/email", null, "POST", {
    name: "Short",
    email: "short@peakboo-test.invalid",
    password: "short",
  });
  check("short passwords rejected by server", () =>
    assert.notEqual(short.status, 200),
  );
  const room = await call("/api/rooms", alice.token, "POST", {
    name: "Shared test",
    description: "Test only",
    color: "purple",
  });
  assert.equal(room.status, 201);
  const id = room.data.id;
  const aliceData = await call("/api/bootstrap", alice.token);
  const code = aliceData.data.rooms[0].inviteCode;
  check("room owners see their new conversation", () =>
    assert.equal(aliceData.data.rooms[0].id, id),
  );
  const nonMember = await call(`/api/rooms/${id}/messages`, bob.token);
  check("non-members cannot read a room", () =>
    assert.equal(nonMember.status, 404),
  );
  const badWrite = await call(
    `/api/rooms/${id}/messages`,
    charlie.token,
    "POST",
    { id: randomUUID(), text: "No access" },
  );
  check("non-members cannot write to a room", () =>
    assert.equal(badWrite.status, 404),
  );
  const badInvite = await call("/api/join", bob.token, "POST", {
    code: "not-an-invite",
  });
  check("unknown invitations rejected", () =>
    assert.equal(badInvite.status, 404),
  );
  const joined = await call("/api/join", bob.token, "POST", { code });
  check("invitation grants room membership", () =>
    assert.equal(joined.data.id, id),
  );
  const streamController = new AbortController();
  const stream = await fetch("http://localhost:3001/api/live", {
    headers: { Authorization: "Bearer " + bob.token },
    signal: streamController.signal,
  });
  const reader = stream.body.getReader();
  await reader.read();
  const messageId = randomUUID(),
    text = "Coffee tomorrow?";
  await call(`/api/rooms/${id}/messages`, alice.token, "POST", {
    id: messageId,
    text,
  });
  const signal = await Promise.race([
    reader.read(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("No live event")), 4000),
    ),
  ]);
  check("live stream notifies another account", () =>
    assert.ok(new TextDecoder().decode(signal.value).includes(id)),
  );
  streamController.abort();
  await call(`/api/rooms/${id}/messages`, alice.token, "POST", {
    id: messageId,
    text,
  });
  const messages = await call(`/api/rooms/${id}/messages`, bob.token);
  check("message retries are idempotent", () =>
    assert.equal(messages.data.messages.length, 1),
  );
  const steal = await call(`/api/rooms/${id}/messages`, bob.token, "POST", {
    id: messageId,
    text: "Different author",
  });
  check("message IDs cannot be reused by another sender", () =>
    assert.equal(steal.status, 409),
  );
  const startsAt = "2026-12-28T16:00:00-03:00",
    endsAt = "2026-12-28T18:00:00-03:00";
  const invalid = await call(`/api/rooms/${id}/events`, alice.token, "POST", {
    title: "Coffee",
    startsAt,
    endsAt: "2026-12-28T15:00:00-03:00",
  });
  check("invalid event ranges rejected", () =>
    assert.equal(invalid.status, 400),
  );
  const event = await call(`/api/rooms/${id}/events`, alice.token, "POST", {
    title: "Coffee",
    startsAt,
    endsAt,
    location: "The cafe",
    color: "coral",
  });
  assert.equal(event.status, 201);
  const eid = event.data.id;
  const shared = await call("/api/bootstrap", bob.token);
  check("calendar event appears for all members", () =>
    assert.equal(shared.data.events[0].id, eid),
  );
  check("event timezone round trips correctly", () =>
    assert.equal(shared.data.events[0].startsAt, "2026-12-28T19:00:00.000Z"),
  );
  const eventMessage = await call(`/api/rooms/${id}/messages`, bob.token);
  check("calendar event also appears in chat", () =>
    assert.ok(eventMessage.data.messages.some((m) => m.eventId === eid)),
  );
  await call(`/api/rooms/${id}/events/${eid}/rsvp`, bob.token, "POST", {
    status: "maybe",
  });
  const presence = await call("/api/bootstrap", alice.token);
  check("presence is shared between accounts", () =>
    assert.equal(
      presence.data.events[0].rsvps.find((r) => r.userId === bob.data.user.id)
        .status,
      "maybe",
    ),
  );
  const edit = await call(`/api/rooms/${id}/events/${eid}`, bob.token, "PUT", {
    title: "Changed",
    startsAt,
    endsAt,
  });
  check("other members cannot edit someone else’s event", () =>
    assert.equal(edit.status, 403),
  );
  const cancel = await call(
    `/api/rooms/${id}/events/${eid}`,
    bob.token,
    "DELETE",
  );
  check("other members cannot cancel someone else’s event", () =>
    assert.equal(cancel.status, 403),
  );
  const unrelated = await call("/api/bootstrap", charlie.token);
  check("private records excluded from unrelated accounts", () => {
    assert.equal(unrelated.data.rooms.length, 0);
    assert.equal(unrelated.data.events.length, 0);
  });
  await call(
    `/api/rooms/${id}/messages/${messageId}/reaction`,
    bob.token,
    "POST",
    { emoji: "❤️" },
  );
  const reaction = await call(`/api/rooms/${id}/messages`, alice.token);
  check("reactions shared between accounts", () =>
    assert.equal(
      reaction.data.messages.find((m) => m.id === messageId).reactions[0].emoji,
      "❤️",
    ),
  );
  await call(
    `/api/rooms/${id}/messages/${messageId}/reaction`,
    bob.token,
    "POST",
    { emoji: "❤️" },
  );
  const removed = await call(`/api/rooms/${id}/messages`, alice.token);
  check("reaction toggle removes only the actor’s reaction", () =>
    assert.equal(
      removed.data.messages.find((m) => m.id === messageId).reactions.length,
      0,
    ),
  );
  client = postgres.getPgClient();
  await client.connect();
  for (let i = 0; i < 85; i++)
    await client.query(
      "INSERT INTO messages(id,room_id,sender_id,text,created_at) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        id,
        alice.data.user.id,
        "Paged " + i,
        new Date(Date.now() + i * 1000),
      ],
    );
  const page = await call(`/api/rooms/${id}/messages`, bob.token);
  check("history is bounded to 80 messages", () => {
    assert.equal(page.data.messages.length, 80);
    assert.equal(page.data.hasMore, true);
  });
  const older = await call(
    `/api/rooms/${id}/messages?before=${encodeURIComponent(page.data.messages[0].createdAt)}`,
    bob.token,
  );
  check("earlier messages can be paged without duplicates", () => {
    assert.equal(older.data.messages.length, 7);
    assert.ok(
      !page.data.messages.some((m) =>
        older.data.messages.some((o) => o.id === m.id),
      ),
    );
  });
  const updated = await call(
    `/api/rooms/${id}/events/${eid}`,
    alice.token,
    "PUT",
    { title: "Coffee together", startsAt, endsAt },
  );
  check("creator can edit their event", () =>
    assert.equal(updated.status, 200),
  );
  const ended = await call(
    `/api/rooms/${id}/events/${eid}`,
    alice.token,
    "DELETE",
  );
  check("creator can cancel their event", () =>
    assert.equal(ended.status, 200),
  );
  const after = await call("/api/bootstrap", bob.token);
  check("cancellation preserved for other participants", () =>
    assert.equal(after.data.events[0].cancelled, true),
  );
  const binary = async(route,token,mime,bytes) => fetch("http://localhost:3001"+route,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":mime},body:bytes});
  const uploaded=await binary(`/api/rooms/${id}/files?name=teste.txt`,alice.token,"text/plain",Buffer.from("private file"));
  assert.equal(uploaded.status,201);const file=await uploaded.json();
  check("members can upload durable files",()=>assert.ok(file.id));
  const deniedUpload=await binary(`/api/rooms/${id}/files`,charlie.token,"text/plain",Buffer.from("denied"));
  check("outsiders cannot upload",()=>assert.equal(deniedUpload.status,404));
  const attach=await call(`/api/rooms/${id}/messages`,alice.token,"POST",{id:randomUUID(),text:"",attachmentId:file.id});
  check("file-only messages supported",()=>assert.equal(attach.status,201));
  const invalidAttach=await call(`/api/rooms/${id}/messages`,bob.token,"POST",{id:randomUUID(),text:"",attachmentId:file.id});
  check("another sender cannot reuse uploaded files",()=>assert.equal(invalidAttach.status,400));
  const download=await fetch("http://localhost:3001/api/media/"+file.id,{headers:{Authorization:"Bearer "+bob.token}});
  check("members download original bytes",()=>assert.equal(download.status,200));assert.equal(await download.text(),"private file");
  const deniedDownload=await call("/api/media/"+file.id,charlie.token);
  check("outsiders cannot download",()=>assert.equal(deniedDownload.status,404));
  const photo=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKd8AAAAASUVORK5CYII=","base64");
  const roomPhoto=await binary(`/api/rooms/${id}/photo`,alice.token,"image/png",photo);
  check("owner changes conversation photo",()=>assert.equal(roomPhoto.status,201));
  const refusedPhoto=await binary(`/api/rooms/${id}/photo`,bob.token,"image/png",photo);
  check("other members cannot change conversation photo",()=>assert.equal(refusedPhoto.status,403));
  const profilePhoto=await binary('/api/profile/photo',alice.token,"image/png",photo);
  check("profile photo is saved",()=>assert.equal(profilePhoto.status,201));
  const badPhoto=await binary('/api/profile/photo',alice.token,"image/svg+xml",Buffer.from("<svg/>"));
  check("active image formats rejected",()=>assert.equal(badPhoto.status,400));
  const oversized=await binary(`/api/rooms/${id}/files`,alice.token,"text/plain",Buffer.alloc(10485761,65));
  check("oversized uploads rejected",()=>assert.equal(oversized.status,413));
  const photosBoot=await call('/api/bootstrap',alice.token);
  check("photos persist in bootstrap",()=>{assert.ok(photosBoot.data.user.image);assert.ok(photosBoot.data.rooms[0].image)});
  await call("/api/auth/sign-out", bob.token, "POST", {});
  const expired = await call("/api/bootstrap", bob.token);
  check("sign-out revokes API access", () => assert.equal(expired.status, 401));
  console.log(
    `\n${checks} integration checks passed. Disposable database removed.`,
  );
} finally {
  if (client) await client.end();
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (
    postgres.process?.exitCode === null &&
    postgres.process?.signalCode === null
  )
    await postgres.stop().catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
