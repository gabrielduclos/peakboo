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
  const imageUpload=await binary(`/api/rooms/${id}/files?width=800&height=400`,alice.token,"image/png",photo);assert.equal(imageUpload.status,201);const imageMedia=await imageUpload.json();
  const imageMessageId=randomUUID();await call(`/api/rooms/${id}/messages`,alice.token,"POST",{id:imageMessageId,text:"",attachmentId:imageMedia.id});
  const imageMessages=await call(`/api/rooms/${id}/messages?kind=image`,bob.token);
  check("media dimensions persist for skeleton layout",()=>{const m=imageMessages.data.messages.find(m=>m.id===imageMessageId);assert.equal(m.attachment.width,800);assert.equal(m.attachment.height,400)});
  const replyId=randomUUID();
  const reply=await call(`/api/rooms/${id}/messages`,bob.token,"POST",{id:replyId,text:"A reply",replyTo:messageId});
  check("replies stay in the same room",()=>assert.equal(reply.status,201));
  const replyPage=await call(`/api/rooms/${id}/messages?around=${replyId}`,bob.token);
  check("reply carries author and original text",()=>{const m=replyPage.data.messages.find(m=>m.replyTo===messageId);assert.ok(m.replySenderName);assert.ok(m.replySenderId);assert.equal(m.replyDeleted,false);assert.ok(m.replyText)});
  const around=await call(`/api/rooms/${id}/messages?around=${messageId}`,bob.token);
  check("reply navigation finds original outside latest page",()=>assert.ok(around.data.messages.some(m=>m.id===messageId)));
  const deniedAround=await call(`/api/rooms/${id}/messages?around=${messageId}`,charlie.token);
  check("reply navigation denies nonmembers",()=>assert.equal(deniedAround.status,404));
  const missingAround=await call(`/api/rooms/${id}/messages?around=${randomUUID()}`,bob.token);
  check("unavailable target returns no unrelated history",()=>assert.equal(missingAround.data.messages.length,0));
  const malformedAround=await call(`/api/rooms/${id}/messages?around=invalid`,bob.token);
  check("reply target validates UUID",()=>assert.equal(malformedAround.status,400));
  const foreignReply=await call(`/api/rooms/${id}/messages`,bob.token,"POST",{id:randomUUID(),text:"Invalid reply",replyTo:randomUUID()});
  check("nonexistent replies rejected",()=>assert.equal(foreignReply.status,400));
  const messageEdit=await call(`/api/rooms/${id}/messages/${messageId}`,alice.token,"PUT",{text:"Edited coffee"});
  check("sender can edit text",()=>assert.equal(messageEdit.status,200));
  const forbiddenEdit=await call(`/api/rooms/${id}/messages/${messageId}`,bob.token,"PUT",{text:"Impersonation"});
  check("other members cannot edit",()=>assert.equal(forbiddenEdit.status,403));
  const pin=await call(`/api/rooms/${id}/messages/${messageId}/pin`,bob.token,"POST",{});
  check("participants can pin",()=>assert.equal(pin.status,200));
  const pinned=await call(`/api/rooms/${id}/messages?kind=pinned`,alice.token);
  check("pinned filter returns only pinned messages",()=>{assert.ok(pinned.data.messages.some(m=>m.id===messageId));assert.ok(pinned.data.messages.every(m=>m.pinned))});
  const search=await call(`/api/rooms/${id}/messages?q=Edited%20coffee`,bob.token);
  check("search covers history beyond the latest page",()=>assert.ok(search.data.messages.some(m=>m.id===messageId)));
  const range=await call(`/api/rooms/${id}/messages?from=2099-01-01T00:00:00Z`,bob.token);
  check("date filter reaches server",()=>assert.equal(range.data.messages.length,0));
  const fileFilter=await call(`/api/rooms/${id}/messages?kind=files`,bob.token);
  check("file filter excludes text",()=>assert.ok(fileFilter.data.messages.every(m=>m.attachment)));
  const deniedCancel=await call(`/api/rooms/${id}/messages/${messageId}`,bob.token,"DELETE");
  check("other members cannot cancel",()=>assert.equal(deniedCancel.status,403));
  const canceled=await call(`/api/rooms/${id}/messages/${messageId}`,alice.token,"DELETE");
  check("sender can cancel",()=>assert.equal(canceled.status,200));
  const deletedReplies=await call(`/api/rooms/${id}/messages?around=${replyId}`,bob.token);
  check("deleted original is redacted in reply",()=>{const m=deletedReplies.data.messages.find(m=>m.replyTo===messageId);assert.equal(m.replyDeleted,true);assert.equal(m.replyText,'');assert.equal(m.replyMime,null)});
  const afterDelete=await call(`/api/rooms/${id}/messages?q=Edited%20coffee`,bob.token);
  check("canceled body is removed from search",()=>assert.equal(afterDelete.data.messages.length,0));
  const outsiderDelete=await call(`/api/rooms/${id}`,charlie.token,"DELETE");
  check("outsiders cannot delete a group",()=>assert.equal(outsiderDelete.status,404));
  const memberDelete=await call(`/api/rooms/${id}`,bob.token,"DELETE");
  check("members cannot delete the owner's group",()=>assert.equal(memberDelete.status,403));
  const malformedDelete=await call('/api/rooms/not-a-uuid',alice.token,"DELETE");
  check("invalid group IDs are rejected",()=>assert.equal(malformedDelete.status,404));
  const stillThere=await call(`/api/rooms/${id}/messages`,bob.token);
  check("denied deletion leaves the conversation intact",()=>assert.equal(stillThere.status,200));
  const keptRoom=await call('/api/rooms',alice.token,'POST',{name:'Keep this group',description:'Not deleted',color:'blue'});
  assert.equal(keptRoom.status,201);
  const keptMessage=randomUUID();await call(`/api/rooms/${keptRoom.data.id}/messages`,alice.token,'POST',{id:keptMessage,text:'Keep this message'});
  await call(`/api/rooms/${id}/messages/${imageMessageId}/report`,bob.token,'POST');
  const deletedController=new AbortController();
  const deletedStream=await fetch('http://localhost:3001/api/live',{headers:{Authorization:'Bearer '+bob.token},signal:deletedController.signal});
  const deletedReader=deletedStream.body.getReader();await deletedReader.read();
  const deletion=await call(`/api/rooms/${id}`,alice.token,'DELETE');
  check("the owner can delete a group with attachments and events",()=>assert.equal(deletion.status,200,JSON.stringify(deletion.data)));
  const deletionSignal=await Promise.race([deletedReader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Missing deletion event')),4000))]);
  check("former participants receive a live deletion event",()=>assert.ok(new TextDecoder().decode(deletionSignal.value).includes('"deletedRoomId":"'+id+'"')));
  deletedController.abort();
  for(const table of ['rooms','members','messages','events','media']) {
    const field=table==='rooms'?'id':'room_id';
    const count=await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${field}=$1`,[id]);
    check(`group deletion clears ${table}`,()=>assert.equal(count.rows[0].count,0));
  }
  const reportCount=await client.query('SELECT count(*)::int AS count FROM message_reports WHERE message_id=$1',[imageMessageId]);
  check("deletion clears message reports",()=>assert.equal(reportCount.rows[0].count,0));
  const deletedBoot=await call('/api/bootstrap',bob.token);
  check("deleted group and its events disappear for participants",()=>{assert.ok(!deletedBoot.data.rooms.some(r=>r.id===id));assert.ok(!deletedBoot.data.events.some(e=>e.roomId===id))});
  const deletedInvite=await call('/api/join',charlie.token,'POST',{code});
  check("deleted invitations no longer grant access",()=>assert.equal(deletedInvite.status,404));
  const deletedDownload=await call('/api/media/'+file.id,alice.token);
  check("deleted files cannot be downloaded even by their uploader",()=>assert.equal(deletedDownload.status,404));
  const repeated=await call(`/api/rooms/${id}`,alice.token,'DELETE');
  check("repeated group deletion returns not found",()=>assert.equal(repeated.status,404));
  const kept=await call(`/api/rooms/${keptRoom.data.id}/messages`,alice.token);
  check("deletion preserves other groups and their messages",()=>assert.ok(kept.data.messages.some(m=>m.id===keptMessage)));
  const keptProfile=await call('/api/bootstrap',alice.token);
  check("deletion preserves user accounts and profile photos",()=>assert.ok(keptProfile.data.user.image));

  const publicPhotoId=profilePhoto.status===201?(await keptProfile.data.user.image).split('/').at(-1):null;
  const aliceId=alice.data.user.id,bobId=bob.data.user.id,charlieId=charlie.data.user.id;
  const makeProfile=(handle,name,isPublic=true)=>({handle,name,bio:'A shared bio',isPublic});
  const noProfile=await call('/api/me/profile',alice.token);
  check('existing accounts remain private until explicitly published',()=>assert.equal(noProfile.data.profile.isPublic,false));
  const saveAlice=await call('/api/me/profile',alice.token,'PUT',makeProfile('alice','Alice Public'));
  check('owner can publish a profile',()=>assert.equal(saveAlice.status,200));
  await call('/api/me/profile',bob.token,'PUT',makeProfile('bob','Bob Public'));
  await call('/api/me/profile',charlie.token,'PUT',makeProfile('charlie','Charlie Public',false));
  const publicAlice=await call('/api/public/profiles/alice');
  check('anonymous profile contains public details without email or authentication data',()=>{assert.equal(publicAlice.data.profile.name,'Alice Public');assert.equal(publicAlice.data.profile.handle,'alice');assert.ok(!JSON.stringify(publicAlice.data).includes('peakboo-test.invalid'));assert.equal(publicAlice.data.profile.email,undefined)});
  const publicImage=await fetch('http://localhost:3001'+publicAlice.data.profile.image);
  check('only the current published profile photo is anonymously accessible',()=>assert.equal(publicImage.status,200));
  const privateProfile=await call('/api/public/profiles/charlie');
  check('private profiles cannot be read anonymously',()=>assert.equal(privateProfile.status,404));
  const searchPeople=await call('/api/profiles/search?q=Public',bob.token);
  check('people discovery is unavailable',()=>assert.equal(searchPeople.status,404));
  const reserved=await call('/api/me/profile',charlie.token,'PUT',makeProfile('admin','Charlie'));
  check('reserved handles are rejected',()=>assert.equal(reserved.status,400));
  const taken=await call('/api/me/profile',charlie.token,'PUT',makeProfile('alice','Charlie'));
  check('handles are unique across accounts',()=>assert.equal(taken.status,423));
  // A new profile has no cooldown; test unique handling separately.
  await client.query(`UPDATE profiles SET handle_changed_at=now()-interval '16 days' WHERE user_id=$1`,[charlieId]);
  const takenAfterCooldown=await call('/api/me/profile',charlie.token,'PUT',makeProfile('alice','Charlie'));
  check('duplicate handles return a stable conflict after cooldown',()=>assert.equal(takenAfterCooldown.status,409));
  const cooldown=await call('/api/me/profile',alice.token,'PUT',makeProfile('alice_new','Alice Public'));
  check('username changes enforce the adapted 15-day cooldown',()=>assert.equal(cooldown.status,423));
  const invalidProfile=await call('/api/me/profile',alice.token,'PUT',{...makeProfile('alice','Alice'),userId:bobId});
  check('profile edits cannot target another account',()=>assert.equal(invalidProfile.status,400));
  const deniedDirect=await call('/api/contacts/'+bobId+'/conversation',alice.token,'POST');
  check('direct conversation creation is unavailable',()=>assert.equal(deniedDirect.status,404));
  const deniedContacts=await call('/api/contacts',alice.token);
  check('contact list is unavailable',()=>assert.equal(deniedContacts.status,404));
  const directId=randomUUID();const [directA,directB]=[aliceId,bobId].sort();
  await client.query("INSERT INTO rooms(id,name,owner_id,invite_code,kind,direct_a,direct_b) VALUES($1,'',$2,$3,'direct',$2,$4)",[directId,directA,'legacy-'+directId,directB]);
  await client.query("INSERT INTO members(room_id,user_id) VALUES($1,$2),($1,$3)",[directId,aliceId,bobId]);
  const legacyBoot=await call('/api/bootstrap',alice.token);
  check('legacy direct rooms are not listed',()=>assert.ok(!legacyBoot.data.rooms.some(r=>r.id===directId)));
  const legacyRead=await call('/api/rooms/'+directId+'/messages',alice.token);
  check('legacy direct room endpoints are unavailable',()=>assert.equal(legacyRead.status,404));
  const cover=await binary('/api/profile/cover',alice.token,'image/png',photo);
  check('cover photos use independent durable storage',()=>assert.equal(cover.status,201));
  const aliceWithCover=await call('/api/public/profiles/alice');
  check('published cover is visible independently of the avatar',()=>{assert.ok(aliceWithCover.data.profile.cover);assert.notEqual(aliceWithCover.data.profile.cover,aliceWithCover.data.profile.image)});
  await call('/api/me/profile',alice.token,'PUT',makeProfile('alice','Alice Public',false));
  const revokedPublic=await call('/api/public/profiles/alice'),revokedPhoto=await fetch('http://localhost:3001'+publicAlice.data.profile.image);
  check('making a profile private revokes public profile and photo URLs',()=>{assert.equal(revokedPublic.status,404);assert.equal(revokedPhoto.status,404)});
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
