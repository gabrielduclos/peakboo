import {test} from "node:test";
import assert from "node:assert/strict";
import {createRealtime} from "./realtime.mjs";
import {createMemberMiddleware,registerSession,jsonError} from "./middleware/access.mjs";
import {registerNotifications} from "./routes/notifications.mjs";
import {registerBootstrap,countUnreadNotifications} from "./routes/bootstrap.mjs";
import {registerGroups,registerGroupMembership} from "./routes/groups.mjs";
import {registerMessageHistory,registerMessageActions} from "./routes/messages.mjs";
import {registerEvents} from "./routes/events.mjs";
import {registerLists} from "./routes/lists.mjs";
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
 registerNotifications(app,deps);
 registerGroups(app,deps);
 registerMessageHistory(app,deps);
 registerGroupMembership(app,deps);
 registerMessageActions(app,deps);
 registerEvents(app,deps);
 registerMedia(app,deps);
 registerLists(app,deps);
 assert.deepEqual(calls.map(c=>c.method+" "+c.path),[
 "use /api","get /api/live","get /api/bootstrap","post /api/notifications/state",
 "post /api/rooms","delete /api/rooms/:room","post /api/join",
 "get /api/rooms/:room/messages","post /api/rooms/:room/read","get /api/rooms/:room/members",
 "post /api/rooms/:room/messages","put /api/rooms/:room/messages/:message","delete /api/rooms/:room/messages/:message",
 "post /api/rooms/:room/messages/:message/pin","post /api/rooms/:room/messages/:message/report","post /api/rooms/:room/messages/:message/reaction",
 "post /api/rooms/:room/events","put /api/rooms/:room/events/:event","post /api/rooms/:room/events/:event/rsvp","delete /api/rooms/:room/events/:event",
 "post /api/profile/cover","delete /api/profile/cover","post /api/profile/photo",
 "post /api/rooms/:room/photo","post /api/rooms/:room/files","get /api/media/:id",
 "post /api/rooms/:room/lists","post /api/rooms/:room/messages/:message/list","put /api/rooms/:room/messages/:message/list","post /api/rooms/:room/lists/refresh"]);
 for(const c of calls.filter(c=>c.path.includes("/:room")))assert.equal(c.handlers[0],member,c.path);
 assert.equal(calls.find(c=>c.path==="/api/rooms/:room/photo").handlers.length,4);
 assert.equal(calls.find(c=>c.path==="/api/rooms/:room/files").handlers.length,3);
});
test("realtime skips database queries when there are no connected clients",async()=>{
 const realtime=createRealtime({query(){throw Error("unexpected query")}});
 await realtime.publish("unused");realtime.close();
});

test("account notification changes reach only that account and all its connected sessions",()=>{
 const realtime=createRealtime({query(){throw Error("unexpected query")}});
 const received=[];
 const response=label=>({write:message=>{received.push([label,JSON.parse(message.slice(6))]);return true}});
 realtime.live.set("user-a",new Set([response("phone"),response("desktop")]));
 realtime.live.set("user-b",new Set([response("other")]));
 realtime.notifyAccount("user-a",{notificationStateChanged:true});
 assert.deepEqual(received,[["phone",{notificationStateChanged:true}],["desktop",{notificationStateChanged:true}]]);
});


test("push badge includes unread reactions and clears only acknowledged notices",()=>{
 const snapshot={rooms:[{id:"a",unread:0},{id:"b",unread:2}],events:[],activity:[],reactionNotices:[{id:"one",roomId:"a"},{id:"two",roomId:"b"}],notificationState:{read:[],dismissed:[]}};
 assert.equal(countUnreadNotifications(snapshot,"user"),4);
 snapshot.notificationState.read.push("reaction:one");
 assert.equal(countUnreadNotifications(snapshot,"user"),3);
 snapshot.notificationState.dismissed.push("reaction:two");
 assert.equal(countUnreadNotifications(snapshot,"user"),2);
});
