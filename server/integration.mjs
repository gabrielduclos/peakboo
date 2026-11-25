// Isolated, disposable PostgreSQL. Never connects to a user's hosted database.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes, createECDH } from "node:crypto";
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
      PUSH_ENABLED:"true",
      PUSH_VAPID_PRIVATE_KEY:"",
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
      cache: res.headers.get("cache-control"),
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
  check("anonymous API responses are not cached",()=>assert.match(anonymous.cache,/no-store/));
  const users = [];
  for (const name of ["Alice", "Bob", "Charlie"]) {
    const credential="test-password-"+randomBytes(10).toString("hex");
    const user = await call("/api/auth/sign-up/email", null, "POST", {
      name,
      email: name.toLowerCase() + "@peakboo-test.invalid",
      password: credential,
    });
    assert.equal(user.status, 200, JSON.stringify(user.data));
    assert.ok(user.token);
    assert.match(user.cache,/no-store/);
    users.push({...user,credential});
  }
  const [alice, bob, charlie] = users;
  const privateBootstrap=await call("/api/bootstrap",alice.token);
  check("authenticated bootstrap cannot be cached",()=>{assert.equal(privateBootstrap.status,200);assert.match(privateBootstrap.cache,/private/);assert.match(privateBootstrap.cache,/no-store/)});
  const pushConfig=await call("/api/push/config",alice.token);
  check("push config exposes only a valid public VAPID key",()=>{assert.equal(pushConfig.status,200);assert.equal(pushConfig.data.enabled,true);assert.equal(Buffer.from(pushConfig.data.publicKey,"base64url").length,65);assert.equal(pushConfig.data.privateKey,undefined)});
  const receiver=createECDH("prime256v1");receiver.generateKeys();
  const sub={endpoint:"https://fcm.googleapis.com/fcm/send/peakboo-test-"+randomUUID(),keys:{p256dh:receiver.getPublicKey().toString("base64url"),auth:randomBytes(16).toString("base64url")},locale:"pt",preview:false};
  const invalidSub=await call("/api/push/subscriptions",alice.token,"POST",{...sub,endpoint:"https://127.0.0.1/test"});
  check("push rejects non-provider endpoints",()=>assert.equal(invalidSub.status,400));
  const validSub=await call("/api/push/subscriptions",alice.token,"POST",sub);
  check("authenticated device can subscribe",()=>assert.equal(validSub.status,200));
  const ownStatus=await call("/api/push/status",alice.token,"POST",{endpoint:sub.endpoint});
  const otherStatus=await call("/api/push/status",bob.token,"POST",{endpoint:sub.endpoint});
  check("subscription status is session-scoped",()=>{assert.equal(ownStatus.data.active,true);assert.equal(ownStatus.data.preview,false);assert.equal(otherStatus.data.active,false)});
  await call("/api/push/subscriptions",bob.token,"DELETE",{endpoint:sub.endpoint});
  const stillActive=await call("/api/push/status",alice.token,"POST",{endpoint:sub.endpoint});
  check("other users cannot unsubscribe a device",()=>assert.equal(stillActive.data.active,true));
  await call("/api/push/subscriptions",alice.token,"DELETE",{endpoint:sub.endpoint});
  const removedStatus=await call("/api/push/status",alice.token,"POST",{endpoint:sub.endpoint});
  check("owner can unsubscribe",()=>assert.equal(removedStatus.data.active,false));
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
  const peerPath="/api/profiles/"+encodeURIComponent(alice.data.user.id);
  const peer=await call(peerPath,bob.token);
  check("group participants can open a read-only profile",()=>{assert.equal(peer.status,200);assert.deepEqual(Object.keys(peer.data.profile).sort(),["bio","cover","id","image","name"]);assert.equal(peer.data.profile.id,alice.data.user.id)});
  const outsiderProfile=await call(peerPath,charlie.token);
  check("unrelated accounts cannot open profiles",()=>assert.equal(outsiderProfile.status,404));
  const anonymousProfile=await call(peerPath,null);
  check("profiles require authentication",()=>assert.equal(anonymousProfile.status,401));
  const selfProfile=await call("/api/profiles/"+encodeURIComponent(charlie.data.user.id),charlie.token);
  check("own profile is available without a group",()=>assert.equal(selfProfile.status,200));
  const streamController = new AbortController();
  const stream = await fetch("http://localhost:3001/api/live", {
    headers: { Authorization: "Bearer " + bob.token },
    signal: streamController.signal,
  });
  check("authenticated SSE is private and not cacheable",()=>{assert.equal(stream.status,200);assert.match(stream.headers.get("cache-control"),/private/);assert.match(stream.headers.get("cache-control"),/no-store/)});
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
  const confirmPath=`/api/rooms/${id}/events/${eid}/rsvp`;
  await Promise.all([call(confirmPath,bob.token,"POST",{status:"yes"}),call(confirmPath,bob.token,"POST",{status:"yes"})]);
  const confirmations=(await call("/api/bootstrap",alice.token)).data.activity.filter(a=>a.eventId===eid&&a.action==="confirmed");
  check("attendance confirmation is registered exactly once on duplicate requests",()=>{assert.equal(confirmations.length,1);assert.equal(confirmations[0].actorName,bob.data.user.name)});
  const ownConfirmations=(await call("/api/bootstrap",bob.token)).data.activity;
  const outsiderConfirmations=(await call("/api/bootstrap",charlie.token)).data.activity;
  check("confirmation notifies other group participants only",()=>{assert.equal(ownConfirmations.some(a=>a.eventId===eid&&a.action==="confirmed"),false);assert.equal(outsiderConfirmations.some(a=>a.eventId===eid&&a.action==="confirmed"),false)});
  await call(confirmPath,bob.token,"POST",{status:"maybe"});
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
  const setReaction=await call(`/api/rooms/${id}/messages/${messageId}/reaction`,bob.token,'POST',{emoji:'👍',active:true});
  const firstNotice=(await call("/api/bootstrap",alice.token)).data.reactionNotices.find(n=>n.messageId===messageId);
  assert.ok(firstNotice?.id);
  const secondDevice=await call("/api/auth/sign-in/email",null,"POST",{email:alice.data.user.email,password:alice.credential});
  check("same account can open an independent session",()=>{assert.equal(secondDevice.status,200);assert.ok(secondDevice.token);assert.notEqual(secondDevice.token,alice.token)});
  const noticeId="reaction:"+firstNotice.id;
  const readNotice=await call("/api/notifications/state",alice.token,"POST",{read:[noticeId],dismissed:[]});
  check("notification reading is persisted per account",()=>assert.equal(readNotice.status,200));
  const otherDeviceState=(await call("/api/bootstrap",secondDevice.token)).data.notificationState;
  check("second session sees read state",()=>assert.ok(otherDeviceState.read.includes(noticeId)));
  const dismissNotice=await call("/api/notifications/state",secondDevice.token,"POST",{read:[],dismissed:[noticeId]});
  check("second session can dismiss the same notification",()=>assert.equal(dismissNotice.status,200));
  const retryRead=await call("/api/notifications/state",alice.token,"POST",{read:[noticeId],dismissed:[]});
  assert.equal(retryRead.status,200);
  const persistedState=(await call("/api/bootstrap",alice.token)).data.notificationState;
  check("read retry cannot undo dismissal",()=>{assert.ok(persistedState.read.includes(noticeId));assert.ok(persistedState.dismissed.includes(noticeId))});
  const independentState=(await call("/api/bootstrap",bob.token)).data.notificationState;
  check("other accounts do not receive private notification state",()=>assert.ok(!independentState.dismissed.includes(noticeId)));
  const invalidState=await call("/api/notifications/state",alice.token,"POST",{read:[noticeId],dismissed:[],userId:bob.data.user.id});
  check("notification endpoint rejects caller-supplied account identity",()=>assert.equal(invalidState.status,400));
  const noSessionState=await call("/api/notifications/state",null,"POST",{read:[noticeId],dismissed:[]});
  check("notification state requires authentication",()=>assert.equal(noSessionState.status,401));
  const repeatReaction=await call(`/api/rooms/${id}/messages/${messageId}/reaction`,bob.token,'POST',{emoji:'👍',active:true});
  const repeatNotice=(await call("/api/bootstrap",alice.token)).data.reactionNotices.filter(n=>n.messageId===messageId);
  check("reaction notification is unique and belongs to the author",()=>{assert.equal(repeatNotice.length,1);assert.equal(repeatNotice[0].id,firstNotice.id)});
  const bobNotices=(await call("/api/bootstrap",bob.token)).data.reactionNotices;
  check("reactor does not receive their own reaction notice",()=>assert.equal(bobNotices.some(n=>n.messageId===messageId),false));
  check('reaction desired-state retries are idempotent',()=>{assert.equal(setReaction.data.reaction.active,true);assert.equal(repeatReaction.data.reaction.active,true)});
  const selfReaction=await call(`/api/rooms/${id}/messages/${messageId}/reaction`,alice.token,'POST',{emoji:'❤️',active:true});
   check('authors cannot react to their own messages',()=>assert.equal(selfReaction.status,403));
  await call(`/api/rooms/${id}/messages/${messageId}/reaction`,bob.token,'POST',{emoji:'🔥',active:true});
  await call(`/api/rooms/${id}/messages/${messageId}/reaction`,bob.token,'POST',{emoji:'👍',active:false});
  const replaced=await call(`/api/rooms/${id}/messages`,alice.token);
  const reactionBoot=(await call("/api/bootstrap",alice.token)).data;
  check("reaction replacement updates preview and notification",()=>{const n=reactionBoot.reactionNotices.filter(n=>n.messageId===messageId);assert.equal(n.length,1);assert.equal(n[0].emoji,"🔥");assert.notEqual(n[0].id,firstNotice.id);assert.equal(reactionBoot.rooms.find(r=>r.id===id).preview.emoji,"🔥")});
  await call("/api/push/muted/"+id,alice.token,"PUT",{muted:true});
  const mutedNotices=(await call("/api/bootstrap",alice.token)).data.reactionNotices;
  check("muted groups suppress internal reaction alerts",()=>assert.equal(mutedNotices.some(n=>n.messageId===messageId),false));
  await call("/api/push/muted/"+id,alice.token,"PUT",{muted:false});
  check('changing reaction replaces only the actor emoji; stale removal is harmless',()=>{
    const reactions=replaced.data.messages.find(m=>m.id===messageId).reactions;
    assert.equal(reactions.length,1);
    assert.deepEqual(reactions.map(r=>r.emoji),['🔥']);
  });
  await call(`/api/rooms/${id}/messages/${messageId}/reaction`,bob.token,'POST',{emoji:'🔥',active:false}); 
  await call(`/api/rooms/${id}/messages/${messageId}/reaction`,alice.token,'POST',{emoji:'❤️',active:false});
  const afterRemoval=(await call("/api/bootstrap",alice.token)).data;
  check("removed reactions disappear from notices and group preview",()=>{assert.equal(afterRemoval.reactionNotices.some(n=>n.messageId===messageId),false);assert.equal(afterRemoval.rooms.find(r=>r.id===id).preview.kind,"message")});
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
  const ownPhoto=(await call('/api/me/profile',alice.token)).data.profile.image;
  const peerPhoto=(await call(peerPath,bob.token)).data.profile.image;
  check("current profile photo is returned to owner and group participant",()=>{assert.ok(ownPhoto);assert.equal(peerPhoto,ownPhoto)});
  for(const u of [alice,bob]){const response=await fetch("http://localhost:3001"+ownPhoto,{headers:{Authorization:"Bearer "+u.token}});check("authorized profile photo downloads",()=>{assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/^image\/png/)});assert.deepEqual(Buffer.from(await response.arrayBuffer()),photo)}
  const unrelatedPhoto=await call(ownPhoto,charlie.token);check("unrelated profile photo is denied",()=>assert.equal(unrelatedPhoto.status,404));
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
  const privacyRoom=await call('/api/rooms',alice.token,'POST',{name:'Privacy test',description:'',color:'blue'});
  const privacyId=privacyRoom.data.id;
  const privacyCode=(await call('/api/bootstrap',alice.token)).data.rooms.find(r=>r.id===privacyId).inviteCode;
  const oldId=randomUUID();
  const oldUpload=await binary('/api/rooms/'+privacyId+'/files?name=old.txt',alice.token,'text/plain',Buffer.from('old private bytes'));
  assert.equal(oldUpload.status,201);const oldFile=await oldUpload.json();
  await call('/api/rooms/'+privacyId+'/messages',alice.token,'POST',{id:oldId,text:'Before membership secret',attachmentId:oldFile.id});
  await call('/api/rooms/'+privacyId+'/messages/'+oldId+'/pin',alice.token,'POST',{});
  await call('/api/join',charlie.token,'POST',{code:privacyCode});
  const newcomer=(await call('/api/bootstrap',charlie.token)).data.rooms.find(r=>r.id===privacyId);
  check('new members cannot see old previews or unread counts',()=>{assert.equal(newcomer.lastText,null);assert.equal(newcomer.lastAt,null);assert.equal(newcomer.unread,0)});
  for(const query of ['', '?q=secret','?kind=pinned','?kind=files','?around='+oldId]){
    const hidden=await call('/api/rooms/'+privacyId+'/messages'+query,charlie.token);
    check('pre-join history is hidden '+query,()=>assert.equal(hidden.data.messages.length,0));
  }
  const hiddenMedia=await call('/api/media/'+oldFile.id,charlie.token);
  check('pre-join attachment cannot be fetched by ID',()=>assert.equal(hiddenMedia.status,404));
  const hiddenPin=await call('/api/rooms/'+privacyId+'/messages/'+oldId+'/pin',charlie.token,'POST',{});
  check('new members cannot interact with pre-join messages',()=>assert.equal(hiddenPin.status,404));
  const hiddenReply=await call('/api/rooms/'+privacyId+'/messages',charlie.token,'POST',{id:randomUUID(),text:'Attempt',replyTo:oldId});
  check('new members cannot reply to a hidden message',()=>assert.equal(hiddenReply.status,400));
  const newId=randomUUID();
  await call('/api/rooms/'+privacyId+'/messages',alice.token,'POST',{id:newId,text:'After membership',replyTo:oldId});
  const visible=await call('/api/rooms/'+privacyId+'/messages',charlie.token);
  check('post-join replies do not reveal the hidden original',()=>{assert.equal(visible.data.messages.length,1);const m=visible.data.messages[0];assert.equal(m.id,newId);assert.equal(m.replyTo,null);assert.equal(m.replyText,null);assert.equal(m.replySenderName,null)});
  await call('/api/join',charlie.token,'POST',{code:privacyCode});
  const repeatHistory=await call('/api/rooms/'+privacyId+'/messages',charlie.token);
  check('reusing an invitation does not reset membership history',()=>assert.ok(repeatHistory.data.messages.some(m=>m.id===newId)));
  const noticeEvent=await call('/api/rooms/'+privacyId+'/events',alice.token,'POST',{title:'Reminder test',startsAt:new Date(Date.now()+1800000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),color:'blue'});
  assert.equal(noticeEvent.status,201);
  const notices=(await call('/api/bootstrap',charlie.token)).data.activity;
  check('event activity is scoped to other current group members',()=>assert.ok(notices.some(a=>a.eventId===noticeEvent.data.id&&a.action==='created')));
  const editedNotice=await call('/api/rooms/'+privacyId+'/events/'+noticeEvent.data.id,alice.token,'PUT',{title:'Updated reminder test',startsAt:new Date(Date.now()+1800000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),color:'blue'});
  assert.equal(editedNotice.status,200);
  const cancelledNotice=await call('/api/rooms/'+privacyId+'/events/'+noticeEvent.data.id,alice.token,'DELETE');
  assert.equal(cancelledNotice.status,200);
  const noticeActions=(await call('/api/bootstrap',charlie.token)).data.activity.filter(a=>a.eventId===noticeEvent.data.id).map(a=>a.action);
  check('event updates and cancellations produce durable internal notices',()=>assert.deepEqual(new Set(noticeActions),new Set(['created','updated','cancelled'])));
  const outsiderNotices=(await call('/api/bootstrap',bob.token)).data.activity;
  check('event activity is not exposed to outsiders',()=>assert.ok(!outsiderNotices.some(a=>a.eventId===noticeEvent.data.id)));
  const keptProfile=await call('/api/bootstrap',alice.token);
  check("deletion preserves user accounts and profile photos",()=>assert.ok(keptProfile.data.user.image));

  const aliceId=alice.data.user.id,bobId=bob.data.user.id,charlieId=charlie.data.user.id;
  const savedProfile=await call('/api/me/profile',alice.token,'PUT',{name:'Alice Updated',bio:'A shared bio'});
  check('profile saves without username',()=>assert.equal(savedProfile.status,200));
  const privateProfile=await call('/api/me/profile',alice.token);
  check('profile exposes no username or public setting',()=>{assert.equal(privateProfile.data.profile.name,'Alice Updated');assert.equal(privateProfile.data.profile.handle,undefined);assert.equal(privateProfile.data.profile.isPublic,undefined)});
  const invalidProfile=await call('/api/me/profile',alice.token,'PUT',{name:'Alice',bio:'',userId:bobId});
  check('profile edits cannot target another account',()=>assert.equal(invalidProfile.status,400));
  const publicAlice=await call('/api/public/profiles/alice');
  check('legacy public profile is inaccessible',()=>assert.equal(publicAlice.status,404));
  const publicImage=await call('/api/public-media/'+keptProfile.data.user.image.split('/').at(-1));
  check('legacy public media is inaccessible',()=>assert.equal(publicImage.status,404));
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
  const aliceWithCover=await call('/api/me/profile',alice.token);
  check('private cover and avatar remain independent',()=>{assert.ok(aliceWithCover.data.profile.cover);assert.notEqual(aliceWithCover.data.profile.cover,aliceWithCover.data.profile.image)});
  const listRoom=await call("/api/rooms",alice.token,"POST",{name:"List integration",description:"",color:"blue"});
  assert.equal(listRoom.status,201);
  const listRoot="/api/rooms/"+listRoom.data.id;
  const listCode=(await call("/api/bootstrap",alice.token)).data.rooms.find(r=>r.id===listRoom.data.id).inviteCode;
  const preListId=randomUUID();
  const preList=await call(listRoot+"/lists",alice.token,"POST",{id:preListId,title:"Before join",items:["Secret"]});
  assert.equal(preList.status,201);
  await call("/api/join",bob.token,"POST",{code:listCode});
  const hiddenList=await call(listRoot+"/messages/"+preListId+"/list",bob.token,"PUT",{kind:"toggle",id:preList.data.checklist.items[0].id,done:true});
  check("pre-join lists cannot be changed or refreshed",()=>assert.equal(hiddenList.status,404));
  const hiddenRefresh=await call(listRoot+"/lists/refresh",bob.token,"POST",{ids:[preListId]});
  check("pre-join lists are excluded from reconnect refresh",()=>assert.equal(hiddenRefresh.data.lists.length,0));
  const listId=randomUUID(),payload={id:listId,title:"Shopping",items:["Rice","Milk"]};
  const createdList=await call(listRoot+"/lists",alice.token,"POST",payload);
  check("shared list is created atomically",()=>assert.equal(createdList.status,201));
  const retriedList=await call(listRoot+"/lists",alice.token,"POST",payload);
  check("list creation retries preserve the same items",()=>assert.deepEqual(retriedList.data.checklist,createdList.data.checklist));
  const listPath=listRoot+"/messages/"+listId+"/list";
  const [rice,milk]=createdList.data.checklist.items;
  const outsiderList=await call(listPath,charlie.token,"PUT",{kind:"toggle",id:rice.id,done:true});
  check("non-members cannot update a list",()=>assert.equal(outsiderList.status,404));
  const malformedList=await call(listPath,bob.token,"PUT",{kind:"toggle",id:rice.id,done:"true"});
  check("list operations validate input types",()=>assert.equal(malformedList.status,400));
  const concurrent=await Promise.all([call(listPath,bob.token,"PUT",{kind:"toggle",id:rice.id,done:true}),call(listPath,alice.token,"PUT",{kind:"edit",id:milk.id,text:"Coffee"})]);
  check("concurrent member updates succeed",()=>assert.ok(concurrent.every(r=>r.status===200)));
  const listHistory=await call(listRoot+"/messages",bob.token);
  const sharedList=listHistory.data.messages.find(m=>m.id===listId).checklist;
  check("concurrent edits to different items are retained",()=>{assert.equal(sharedList.items[0].done,true);assert.equal(sharedList.items[1].text,"Coffee")});
  const sourceId=randomUUID(),sourceText="- Bread\n- Eggs";
  await call(listRoot+"/messages",alice.token,"POST",{id:sourceId,text:sourceText});
  const convertPath=listRoot+"/messages/"+sourceId+"/list",convertBody={title:"Breakfast",items:["Bread","Eggs"],originalText:sourceText};
  const deniedConversion=await call(convertPath,bob.token,"POST",convertBody);
  check("only the author can convert a message into a checklist",()=>assert.equal(deniedConversion.status,409));
  const converted=await call(convertPath,alice.token,"POST",convertBody);
  check("conversion preserves the message identity",()=>{assert.equal(converted.status,200);assert.equal(converted.data.id,sourceId)});
  const searched=await call(listRoot+"/messages?q=Coffee",bob.token);
  check("search includes edited checklist items",()=>assert.ok(searched.data.messages.some(m=>m.id===listId)));
  const deletedList=await call(listRoot+"/messages/"+listId,alice.token,"DELETE");
  check("deleting a list message clears its checklist",()=>assert.equal(deletedList.status,200));
  const afterListDelete=await call(listRoot+"/lists/refresh",bob.token,"POST",{ids:[listId]});
  check("reconnect observes deleted checklist",()=>{assert.equal(afterListDelete.data.lists[0].deleted,true);assert.equal(afterListDelete.data.lists[0].checklist,null)});
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
