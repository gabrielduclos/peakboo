import express from "express";
import {privateSocial} from "./social.mjs";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, pool, origins } from "./auth.mjs";
import { migrate } from "./migrate.mjs";
import {createPush} from "./push.mjs";
import {r2,mediaKey,mediaBytes,drainR2Deletes} from "./r2.mjs";
import {
  roomInput,
  messageInput,
  eventInput,
  rsvpInput,
  reactionInput,
} from "./validation.mjs";

await migrate();
if(r2)void drainR2Deletes(pool).catch(()=>console.error("R2 cleanup pending"));
const app = express();
const push=createPush(pool);
await push.start();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origin, cb) =>
      cb(
        null,
        !origin ||
          origins.includes(origin) ||
          origin === process.env.RENDER_EXTERNAL_URL,
      ),
    credentials: true,
    exposedHeaders: ["set-auth-token"],
  }),
);
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "peakboo" }));
app.all("/api/auth/{*splat}", toNodeHandler(auth));
app.use(express.json({ limit: "32kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "RATE_LIMIT" },
  }),
);
app.get("/api/public/profiles/:handle",(_,res)=>res.status(404).json({error:"NOT_FOUND"}));
app.get("/api/public-media/:id",(_,res)=>res.status(404).json({error:"NOT_FOUND"}));
const live = new Map();
function sendLive(id,event){for(const response of live.get(id)||[]){if(response.destroyed||response.writableEnded)continue;try{if(!response.write("data: "+JSON.stringify(event)+"\n\n"))response.end()}catch{response.end()}}}
async function notifyUsers(userId){
 const {rows}=await pool.query("SELECT DISTINCT peer.user_id FROM members me JOIN members peer ON peer.room_id=me.room_id JOIN rooms r ON r.id=me.room_id WHERE me.user_id=$1 AND r.kind='group'",[userId]);
 for(const id of new Set([userId,...rows.map(r=>r.user_id)]))sendLive(id,{profileChanged:true});
}
const jsonError = (res, status, error) => res.status(status).json({ error });
app.use("/api", async (req, res, next) => {
  try {
    const s = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!s) return jsonError(res, 401, "UNAUTHORIZED");
    req.user = s.user;
    req.session = s.session;
    next();
  } catch {
    jsonError(res, 401, "UNAUTHORIZED");
  }
});
privateSocial(app,pool,notifyUsers);
push.register(app);
async function member(req, res, next) {
  try {
    if (
      Object.values(req.params).some(
        (id) =>
          !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
            id,
          ),
      )
    )
      return jsonError(res, 404, "NOT_FOUND");
    const r = await pool.query(
      "SELECT r.*, m.user_id, m.joined_at::text AS member_joined_at FROM rooms r JOIN members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2 AND r.kind='group'",
      [req.params.room, req.user.id],
    );
    if (!r.rowCount) return jsonError(res, 404, "NOT_FOUND");
    req.room = r.rows[0];
    if(req.params.message){
      const visible=await pool.query("SELECT 1 FROM messages WHERE id=$1 AND room_id=$2 AND created_at >= $3::timestamptz",[req.params.message,req.params.room,req.room.member_joined_at]);
      if(!visible.rowCount)return jsonError(res,404,"NOT_FOUND");
    }
    next();
  } catch (e) {
    next(e);
  }
}
async function publish(roomId,change={}){
 if(!live.size)return;
 const {rows}=await pool.query("SELECT m.user_id FROM members m JOIN rooms r ON r.id=m.room_id WHERE r.id=$1 AND r.kind='group' AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM messages msg WHERE msg.id=$2 AND msg.room_id=r.id AND msg.created_at>=m.joined_at))",[roomId,change.reaction?.messageId||null]);
 for(const row of rows)sendLive(row.user_id,{roomId,...change});
}
app.get("/api/live", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write('data: {"connected":true}\n\n');
  if (!live.has(req.user.id)) live.set(req.user.id, new Set());
  live.get(req.user.id).add(res);
  const ping = setInterval(() => {if(!res.destroyed&&!res.writableEnded&&!res.write(": heartbeat\n\n"))res.end()}, 25000);
  const expire = setTimeout(
    () => res.end(),
    Math.min(
      10 * 60000,
      Math.max(1000, new Date(req.session.expiresAt) - Date.now()),
    ),
  );
  res.on("close", () => {
    clearInterval(ping);
    clearTimeout(expire);
    const set = live.get(req.user.id);
    set?.delete(res);
    if (!set?.size) live.delete(req.user.id);
  });
});
app.get("/api/bootstrap", async (req, res) => {
  const rooms = (
    await pool.query(
      `SELECT r.id,r.kind,r.name,r.description,r.color,r.image,r.owner_id AS "ownerId",r.invite_code AS "inviteCode",m.joined_at AS "joinedAt",(SELECT count(*)::int FROM members WHERE room_id=r.id) AS "memberCount",(SELECT text FROM messages WHERE room_id=r.id AND created_at>=m.joined_at ORDER BY created_at DESC,id DESC LIMIT 1) AS "lastText",(SELECT max(created_at) FROM messages WHERE room_id=r.id AND created_at>=m.joined_at) AS "lastAt",(SELECT count(*)::int FROM messages WHERE room_id=r.id AND created_at>m.last_read_at AND created_at>=m.joined_at AND sender_id<>$1) AS unread FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=$1 AND r.kind='group' ORDER BY coalesce((SELECT max(created_at) FROM messages WHERE room_id=r.id AND created_at>=m.joined_at),r.created_at) DESC LIMIT 100`,
      [req.user.id],
    )
  ).rows;
  const events = (
    await pool.query(
      `SELECT e.id,e.room_id AS "roomId",e.creator_id AS "creatorId",e.title,e.description,e.location,e.starts_at AS "startsAt",e.ends_at AS "endsAt",e.color,e.cancelled,r.name AS "roomName",COALESCE((SELECT json_agg(json_build_object('userId',v.user_id,'name',u.name,'status',v.status)) FROM rsvps v JOIN "user" u ON u.id=v.user_id WHERE v.event_id=e.id),'[]') AS rsvps FROM events e JOIN rooms r ON r.id=e.room_id JOIN members m ON m.room_id=e.room_id WHERE m.user_id=$1 AND r.kind='group' AND e.starts_at>now()-interval '1 year' AND e.starts_at<now()+interval '2 years' ORDER BY e.starts_at LIMIT 1000`,
      [req.user.id],
    )
  ).rows;
  const activity=(await pool.query(
    `SELECT a.id,a.event_id AS "eventId",e.room_id AS "roomId",e.title AS "eventTitle",r.name AS "roomName",a.action,a.created_at AS "createdAt" FROM event_activity a JOIN events e ON e.id=a.event_id JOIN rooms r ON r.id=e.room_id JOIN members m ON m.room_id=e.room_id WHERE m.user_id=$1 AND r.kind='group' AND a.actor_id<>$1 AND a.created_at>=m.joined_at AND a.created_at>now()-interval '30 days' ORDER BY a.created_at DESC LIMIT 100`,[req.user.id])).rows;
  res.json({ user: req.user, rooms, events, activity });
});
app.post("/api/rooms", async (req, res) => {
  const data = roomInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const id = randomUUID(),
    code = randomBytes(12).toString("hex");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "INSERT INTO rooms(id,name,description,color,owner_id,invite_code) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        data.data.name,
        data.data.description,
        data.data.color,
        req.user.id,
        code,
      ],
    );
    await c.query("INSERT INTO members(room_id,user_id) VALUES($1,$2)", [
      id,
      req.user.id,
    ]);
    await c.query("COMMIT");
    res.status(201).json({ id });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
// Delete atomically and notify the former participants after the commit.
app.delete("/api/rooms/:room", member, async (req, res) => {
  if (req.room.owner_id !== req.user.id) return jsonError(res, 403, "FORBIDDEN");
  const c = await pool.connect();
  let participants = [];
  try {
    await c.query("BEGIN");
    const locked = await c.query("SELECT owner_id FROM rooms WHERE id=$1 FOR UPDATE", [req.params.room]);
    if (!locked.rowCount) { await c.query("ROLLBACK"); return jsonError(res, 404, "NOT_FOUND"); }
    if (locked.rows[0].owner_id !== req.user.id) { await c.query("ROLLBACK"); return jsonError(res, 403, "FORBIDDEN"); }
    participants = (await c.query("SELECT user_id FROM members WHERE room_id=$1", [req.params.room])).rows;
    // Foreign keys cascade to membership, messages, events, media and reactions.
    await c.query("DELETE FROM rooms WHERE id=$1 AND owner_id=$2", [req.params.room, req.user.id]);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally { c.release(); }
  if(r2)void drainR2Deletes(pool).catch(()=>console.error("R2 cleanup pending"));
  for (const participant of participants)
    for (const stream of live.get(participant.user_id) || []) {
      try { stream.write(`data: ${JSON.stringify({ roomId: req.params.room, deletedRoomId: req.params.room })}\n\n`); } catch {}
    }
  res.json({ ok: true });
});
app.post("/api/join", async (req, res) => {
  if (typeof req.body.code !== "string" || req.body.code.length > 100)
    return jsonError(res, 400, "INVALID_INPUT");
  const room = (
    await pool.query("SELECT id FROM rooms WHERE invite_code=$1 AND kind='group'", [
      req.body.code,
    ])
  ).rows[0];
  if (!room) return jsonError(res, 404, "INVITE_NOT_FOUND");
  await pool.query(
    "INSERT INTO members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [room.id, req.user.id],
  );
  await publish(room.id);
  push.reschedule();
  res.json({ id: room.id });
});
app.get("/api/rooms/:room/messages", member, async (req, res) => {
  const before =
    typeof req.query.before === "string" && !isNaN(Date.parse(req.query.before))
      ? req.query.before
      : null;
  const around=typeof req.query.around==="string"?req.query.around:null;
  if(around&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(around))return jsonError(res,400,"INVALID_INPUT");
  const q=String(req.query.q||"").trim().slice(0,120),kind=String(req.query.kind||"all");
  const from=typeof req.query.from==="string"&&!isNaN(Date.parse(req.query.from))?req.query.from:null;
  const to=typeof req.query.to==="string"&&!isNaN(Date.parse(req.query.to))?req.query.to:null;
  const messages = (
    await pool.query(
      `SELECT m.id,m.text,(SELECT p.id FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replyTo",(SELECT CASE WHEN p.deleted THEN '' ELSE p.text END FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replyText",(SELECT p.sender_id FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replySenderId",(SELECT u.name FROM messages p JOIN "user" u ON u.id=p.sender_id WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replySenderName",(SELECT p.deleted FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replyDeleted",(SELECT a.mime FROM messages p JOIN media a ON a.id=p.attachment_id WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz AND NOT p.deleted) AS "replyMime",m.edited_at AS "editedAt",m.deleted,m.pinned,m.event_id AS "eventId",m.sender_id AS "senderId",u.name AS "senderName",u.image AS "senderImage",(SELECT json_build_object('id',a.id,'name',a.name,'mime',a.mime,'size',a.size,'width',a.width,'height',a.height) FROM media a WHERE a.id=m.attachment_id) AS attachment,m.created_at AS "createdAt",COALESCE((SELECT json_agg(json_build_object('userId',r.user_id,'emoji',r.emoji)) FROM reactions r WHERE r.message_id=m.id),'[]') AS reactions FROM messages m JOIN "user" u ON u.id=m.sender_id WHERE m.room_id=$1 AND m.created_at >= $8::timestamptz AND ($7::uuid IS NULL OR (m.created_at,m.id)<=(SELECT p.created_at,p.id FROM messages p WHERE p.id=$7 AND p.room_id=$1 AND p.created_at >= $8::timestamptz)) AND ($2::timestamptz IS NULL OR m.created_at<$2) AND ($3::timestamptz IS NULL OR m.created_at>=$3) AND ($4::timestamptz IS NULL OR m.created_at<$4) AND ($5='' OR m.text ILIKE '%'||$5||'%') AND ($6='all' OR ($6='pinned' AND m.pinned) OR EXISTS(SELECT 1 FROM media a WHERE a.id=m.attachment_id AND (($6='files' AND a.mime !~ '^(image|video|audio)/') OR a.mime LIKE $6||'/%'))) ORDER BY m.created_at DESC,m.id DESC LIMIT 80`,
      [req.params.room, before,from,to,q,kind,around,req.room.member_joined_at],
    )
  ).rows.reverse();
  res.json({ messages, hasMore: messages.length === 80 });
});
app.post("/api/rooms/:room/read", member, async (req, res) => {
  await pool.query(
    "UPDATE members SET last_read_at=now() WHERE room_id=$1 AND user_id=$2",
    [req.params.room, req.user.id],
  );
  res.json({ ok: true });
});
app.get("/api/rooms/:room/members", member, async (req, res) =>
  res.json({
    members: (
      await pool.query(
        'SELECT u.id,u.name,u.image FROM members m JOIN "user" u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.joined_at',
        [req.params.room],
      )
    ).rows,
  }),
);
app.post("/api/rooms/:room/messages", member, async (req, res) => {
  const data = messageInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  if(data.data.replyTo){const r=await pool.query("SELECT id FROM messages WHERE id=$1 AND room_id=$2 AND NOT deleted AND created_at >= $3::timestamptz",[data.data.replyTo,req.params.room,req.room.member_joined_at]);if(!r.rowCount)return jsonError(res,400,"INVALID_INPUT");}
  if (data.data.attachmentId) {
    const a = await pool.query("SELECT id FROM media WHERE id=$1 AND owner_id=$2 AND room_id=$3 AND created_at >= $4::timestamptz", [data.data.attachmentId,req.user.id,req.params.room,req.room.member_joined_at]);
    if (!a.rowCount) return jsonError(res,400,"INVALID_INPUT");
  }
  const r = await pool.query(
    "INSERT INTO messages(id,room_id,sender_id,text,attachment_id,reply_to) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id",
    [data.data.id, req.params.room, req.user.id, data.data.text, data.data.attachmentId || null,data.data.replyTo || null],
  );
  if (!r.rowCount) {
    const existing = (
      await pool.query("SELECT room_id,sender_id,created_at >= $2::timestamptz AS visible FROM messages WHERE id=$1", [
        data.data.id, req.room.member_joined_at,
      ])
    ).rows[0];
    if (
      existing?.room_id !== req.params.room ||
      existing?.sender_id !== req.user.id || !existing?.visible
    )
      return jsonError(res, 409, "CONFLICT");
  }
  await publish(req.params.room);
  if(r.rowCount)push.notify({kind:"message",roomId:req.params.room,actorId:req.user.id,messageId:data.data.id,body:req.user.name+": "+(data.data.text||"📎")});
  res.status(201).json({ id: data.data.id });
});
app.put("/api/rooms/:room/messages/:message",member,async(req,res)=>{
 const text=typeof req.body.text==="string"?req.body.text.trim():"";
 if(!text||text.length>4000)return jsonError(res,400,"INVALID_INPUT");
 const r=await pool.query("UPDATE messages SET text=$1,edited_at=now() WHERE id=$2 AND room_id=$3 AND sender_id=$4 AND NOT deleted AND event_id IS NULL AND attachment_id IS NULL RETURNING id",[text,req.params.message,req.params.room,req.user.id]);
 if(!r.rowCount)return jsonError(res,403,"FORBIDDEN");await publish(req.params.room);res.json({ok:true});
});
app.delete("/api/rooms/:room/messages/:message",member,async(req,res)=>{
 const r=await pool.query("UPDATE messages SET deleted=true,text='',attachment_id=NULL,pinned=false WHERE id=$1 AND room_id=$2 AND sender_id=$3 AND event_id IS NULL AND NOT deleted RETURNING id",[req.params.message,req.params.room,req.user.id]);
 if(!r.rowCount)return jsonError(res,403,"FORBIDDEN");await publish(req.params.room);res.json({ok:true});
});
app.post("/api/rooms/:room/messages/:message/pin",member,async(req,res)=>{
 const r=await pool.query("UPDATE messages SET pinned=NOT pinned WHERE id=$1 AND room_id=$2 AND NOT deleted RETURNING id",[req.params.message,req.params.room]);
 if(!r.rowCount)return jsonError(res,404,"NOT_FOUND");await publish(req.params.room);res.json({ok:true});
});
app.post("/api/rooms/:room/messages/:message/report",member,async(req,res)=>{
 const r=await pool.query("INSERT INTO message_reports(message_id,user_id) SELECT id,$3 FROM messages WHERE id=$1 AND room_id=$2 AND sender_id<>$3 AND NOT deleted ON CONFLICT DO NOTHING",[req.params.message,req.params.room,req.user.id]);res.json({ok:true});
});
app.post(
  "/api/rooms/:room/messages/:message/reaction",
  member,
  async (req, res) => {
    const data = reactionInput.safeParse(req.body);
    if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
    const db=await pool.connect();let active,added=false;
    try{
      await db.query("BEGIN");
      const m=await db.query("SELECT id FROM messages WHERE id=$1 AND room_id=$2 AND NOT deleted AND created_at >= $3::timestamptz FOR UPDATE",[req.params.message,req.params.room,req.room.member_joined_at]);
      if(!m.rowCount){await db.query("ROLLBACK");return jsonError(res,404,"NOT_FOUND")}
      active=data.data.active;
      if(active===undefined){const existing=await db.query("SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3",[req.params.message,req.user.id,data.data.emoji]);active=!existing.rowCount;}
      if(active)added=!!(await db.query("INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[req.params.message,req.user.id,data.data.emoji])).rowCount;
      else await db.query("DELETE FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3",[req.params.message,req.user.id,data.data.emoji]);
      await db.query("COMMIT");
    }catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
    const reaction={messageId:req.params.message,userId:req.user.id,emoji:data.data.emoji,active};
    await publish(req.params.room,{reaction});
    if(added)push.notify({kind:"reaction",roomId:req.params.room,actorId:req.user.id,messageId:req.params.message,body:req.user.name+" "+data.data.emoji});
    res.json({ok:true,reaction});
  },
);
app.post("/api/rooms/:room/events", member, async (req, res) => {
  const data = eventInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const e = data.data,
    id = randomUUID(),
    c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "INSERT INTO events(id,room_id,creator_id,title,description,location,starts_at,ends_at,color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        req.params.room,
        req.user.id,
        e.title,
        e.description,
        e.location,
        e.startsAt,
        e.endsAt,
        e.color,
      ],
    );
    await c.query(
      "INSERT INTO messages(id,room_id,sender_id,text,event_id) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), req.params.room, req.user.id, e.title, id],
    );
    await c.query(
      "INSERT INTO rsvps(event_id,user_id,status) VALUES($1,$2,'yes')",
      [id, req.user.id],
    );
    await c.query("INSERT INTO event_activity(id,event_id,actor_id,action) VALUES($1,$2,$3,'created')",[randomUUID(),id,req.user.id]);
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
  await publish(req.params.room);
  push.notify({kind:"created",roomId:req.params.room,actorId:req.user.id,eventId:id,body:e.title});
  res.status(201).json({ id });
});
app.put("/api/rooms/:room/events/:event", member, async (req, res) => {
  const data = eventInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const e = data.data;
  const r = await pool.query(
    "WITH changed AS (UPDATE events SET title=$1,description=$2,location=$3,starts_at=$4,ends_at=$5,color=$6 WHERE id=$7 AND room_id=$8 AND creator_id=$9 RETURNING id) INSERT INTO event_activity(id,event_id,actor_id,action) SELECT $10,id,$9,'updated' FROM changed RETURNING event_id",
    [
      e.title,
      e.description,
      e.location,
      e.startsAt,
      e.endsAt,
      e.color,
      req.params.event,
      req.params.room,
      req.user.id,randomUUID(),
    ],
  );
  if (!r.rowCount) return jsonError(res, 403, "FORBIDDEN");
  await publish(req.params.room);
  push.notify({kind:"updated",roomId:req.params.room,actorId:req.user.id,eventId:req.params.event,body:e.title});
  res.json({ ok: true });
});
app.post("/api/rooms/:room/events/:event/rsvp", member, async (req, res) => {
  const data = rsvpInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const e = (
    await pool.query(
      "SELECT id FROM events WHERE id=$1 AND room_id=$2 AND NOT cancelled",
      [req.params.event, req.params.room],
    )
  ).rows[0];
  if (!e) return jsonError(res, 404, "NOT_FOUND");
  await pool.query(
    "INSERT INTO rsvps(event_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status",
    [e.id, req.user.id, data.data.status],
  );
  await publish(req.params.room);
  push.reschedule();
  res.json({ ok: true });
});
app.delete("/api/rooms/:room/events/:event", member, async (req, res) => {
  const r = await pool.query(
    "WITH changed AS (UPDATE events SET cancelled=true WHERE id=$1 AND room_id=$2 AND creator_id=$3 RETURNING id) INSERT INTO event_activity(id,event_id,actor_id,action) SELECT $4,id,$3,'cancelled' FROM changed RETURNING event_id",
    [req.params.event, req.params.room, req.user.id,randomUUID()],
  );
  if (!r.rowCount) return jsonError(res, 403, "FORBIDDEN");
  await publish(req.params.room);
  push.notify({kind:"cancelled",roomId:req.params.room,actorId:req.user.id,eventId:req.params.event});
  res.json({ ok: true });
});

// Binary bodies are parsed only after authentication and room membership checks.
const mediaBody = express.raw({type:()=>true,limit:"10mb"});
async function saveMedia(req, res, roomId, avatar) {
  const mime=(req.headers["content-type"]||"").split(";")[0];
  const allowed=new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime","audio/webm","audio/mp4","audio/ogg","audio/mpeg","audio/wav","audio/aac","audio/x-m4a","application/pdf","text/plain","application/zip","application/octet-stream","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
  if(!allowed.has(mime)|| (avatar && !["image/jpeg","image/png","image/webp","image/gif"].includes(mime)) || !Buffer.isBuffer(req.body)||!req.body.length || (avatar&&req.body.length>1048576))return jsonError(res,400,"INVALID_INPUT");
  const name=String(req.query.name||"arquivo").replace(/[\\/\r\n\x00-\x1f]/g,"_").slice(0,180);
  const width=Number(req.query.width),height=Number(req.query.height);
  if((width||height)&&(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>32768||height>32768))return jsonError(res,400,"INVALID_INPUT");
  const id=randomUUID(),key=r2?mediaKey(id):null; let uploaded=false; const c=await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[req.user.id]);
    const quota=await c.query("SELECT coalesce(sum(size),0)::bigint AS total FROM media WHERE owner_id=$1",[req.user.id]);
    if(Number(quota.rows[0].total)+req.body.length>100*1048576){await c.query("ROLLBACK");return jsonError(res,413,"STORAGE_FULL");}
    if(r2){uploaded=true;await r2.put(key,req.body,mime);}
    await c.query("INSERT INTO media(id,owner_id,room_id,name,mime,size,bytes,width,height,r2_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[id,req.user.id,roomId,name,mime,req.body.length,r2?null:req.body,width||null,height||null,key]);
    if(avatar){
      const url="/api/media/"+id;
      if(roomId)await c.query("UPDATE rooms SET image=$1 WHERE id=$2",[url,roomId]);
      else if(avatar==='cover'){
        await c.query('INSERT INTO profiles(user_id,cover) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET cover=excluded.cover',[req.user.id,url]);
      }else await c.query('UPDATE "user" SET image=$1 WHERE id=$2',[url,req.user.id]);
    }
    await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");if(uploaded){try{const exists=await c.query("SELECT 1 FROM media WHERE id=$1",[id]);if(!exists.rowCount)await c.query("INSERT INTO r2_delete_queue(object_key) VALUES($1) ON CONFLICT DO NOTHING",[key]);}catch{} }throw e;}finally{c.release();}
  if(roomId)await publish(roomId);
  else if(avatar)await notifyUsers(req.user.id);
  res.status(201).json({id,image:"/api/media/"+id,name,mime,size:req.body.length,width:width||null,height:height||null});
}
app.post('/api/profile/cover',mediaBody,(req,res)=>saveMedia(req,res,null,'cover'));
app.delete('/api/profile/cover',async(req,res)=>{await pool.query('UPDATE profiles SET cover=NULL WHERE user_id=$1',[req.user.id]);res.json({ok:true});});
app.post("/api/profile/photo",mediaBody,(req,res)=>saveMedia(req,res,null,true));
app.post("/api/rooms/:room/photo",member,(req,res,next)=>req.room.kind==='group'&&req.room.owner_id===req.user.id?next():jsonError(res,403,"FORBIDDEN"),mediaBody,(req,res)=>saveMedia(req,res,req.params.room,true));
app.post("/api/rooms/:room/files",member,mediaBody,(req,res)=>saveMedia(req,res,req.params.room,false));
app.get("/api/media/:id",async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return jsonError(res,404,"NOT_FOUND");
 const r=await pool.query(`SELECT a.id,a.mime,a.name,a.r2_key,CASE WHEN a.r2_key IS NULL THEN a.bytes ELSE NULL END AS bytes FROM media a WHERE a.id=$1 AND ((a.room_id IS NOT NULL AND EXISTS(SELECT 1 FROM rooms r JOIN members m ON m.room_id=r.id WHERE r.id=a.room_id AND r.kind='group' AND m.user_id=$2 AND (r.image='/api/media/'||a.id::text OR (a.owner_id=$2 AND a.created_at>=m.joined_at) OR EXISTS(SELECT 1 FROM messages msg WHERE msg.room_id=r.id AND msg.attachment_id=a.id AND NOT msg.deleted AND msg.created_at>=m.joined_at)))) OR (a.room_id IS NULL AND (a.owner_id=$2 OR (EXISTS(SELECT 1 FROM "user" u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=a.owner_id AND (u.image='/api/media/'||a.id::text OR p.cover='/api/media/'||a.id::text)) AND EXISTS(SELECT 1 FROM members me JOIN members peer ON peer.room_id=me.room_id JOIN rooms r ON r.id=me.room_id WHERE r.kind='group' AND me.user_id=$2 AND peer.user_id=a.owner_id)))))`,[req.params.id,req.user.id]);
 if(!r.rowCount)return jsonError(res,404,"NOT_FOUND");
 const a=r.rows[0];let bytes;try{bytes=await mediaBytes(a)}catch(e){if(!a.r2_key)throw e;const legacy=(await pool.query("SELECT bytes FROM media WHERE id=$1",[a.id])).rows[0]?.bytes;if(!legacy)throw e;bytes=legacy;}res.set({"Content-Type":a.mime,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(a.name),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}).send(bytes);
});

app.use("/api", (_, res) => jsonError(res, 404, "NOT_FOUND"));
// The API stays available to Cloudflare; the Render HTML is a local-only portfolio.
const dist = fileURLToPath(new URL("../dist-portfolio", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*splat}", (_, res) => res.sendFile(path.join(dist, "index.html")));
}
app.use((err, req, res, next) => {
  console.error("Request failed:", err.code || err.name);
  if (!res.headersSent)
    jsonError(
      res,
      err.type === "entity.too.large" ? 413 : err.type === "entity.parse.failed" ? 400 : 500,
      err.type === "entity.parse.failed" ? "INVALID_INPUT" : "SERVER_ERROR",
    );
});
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("Peakboo ready"),
);
process.on("SIGTERM", () => {
  push.stop();
  for (const set of live.values()) for (const res of set) res.end();
  server.close(() => pool.end().then(() => process.exit(0)));
});
