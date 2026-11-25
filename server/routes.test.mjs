import {test} from "node:test";
import assert from "node:assert/strict";
import {createRealtime} from "./realtime.mjs";
import {createMemberMiddleware,registerSession,jsonError} from "./middleware/access.mjs";
import {registerBootstrap} from "./routes/bootstrap.mjs";
import {registerGroups,registerGroupMembership} from "./routes/groups.mjs";
import {registerMessageHistory,registerMessageActions} from "./routes/messages.mjs";
import {registerEvents} from "./routes/events.mjs";
import {registerMedia} from "./routes/media.mjs";

test("domain registration preserves route order and room access middleware",()=>{
 const calls=[];
 const app=Object.fromEntries(["use","get","post","put","delete"].map(method=>[method,(path,...handlers)=>calls.push({method,path,handlers})]));
 const pool={query(){throw Error("registration must not query database")}};
 const realtime=createRealtime(pool);
 const member=createMemberMiddleware(pool);
 const deps={pool,member,jsonError,push:{},...realtime};
 registerSession(app,{});
 realtime.register(app);
 registerBootstrap(app,deps);
 registerGroups(app,deps);
 registerMessageHistory(app,deps);
 registerGroupMembership(app,deps);
 registerMessageActions(app,deps);
 registerEvents(app,deps);
 registerMedia(app,deps);
 assert.deepEqual(calls.map(c=>c.method+" "+c.path),[
 "use /api","get /api/live","get /api/bootstrap",
 "post /api/rooms","delete /api/rooms/:room","post /api/join",
 "get /api/rooms/:room/messages","post /api/rooms/:room/read","get /api/rooms/:room/members",
 "post /api/rooms/:room/messages","put /api/rooms/:room/messages/:message","delete /api/rooms/:room/messages/:message",
 "post /api/rooms/:room/messages/:message/pin","post /api/rooms/:room/messages/:message/report","post /api/rooms/:room/messages/:message/reaction",
 "post /api/rooms/:room/events","put /api/rooms/:room/events/:event","post /api/rooms/:room/events/:event/rsvp","delete /api/rooms/:room/events/:event",
 "post /api/profile/cover","delete /api/profile/cover","post /api/profile/photo",
 "post /api/rooms/:room/photo","post /api/rooms/:room/files","get /api/media/:id"]);
 for(const c of calls.filter(c=>c.path.includes("/:room")))assert.equal(c.handlers[0],member,c.path);
 assert.equal(calls.find(c=>c.path==="/api/rooms/:room/photo").handlers.length,4);
 assert.equal(calls.find(c=>c.path==="/api/rooms/:room/files").handlers.length,3);
});
test("realtime skips database queries when there are no connected clients",async()=>{
 const realtime=createRealtime({query(){throw Error("unexpected query")}});
 await realtime.publish("unused");realtime.close();
});
