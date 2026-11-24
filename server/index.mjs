import express from "express";
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
import {
  roomInput,
  messageInput,
  eventInput,
  rsvpInput,
  reactionInput,
} from "./validation.mjs";

await migrate();
const app = express();
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
const live = new Map();
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
      "SELECT r.*, m.user_id FROM rooms r JOIN members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2",
      [req.params.room, req.user.id],
    );
    if (!r.rowCount) return jsonError(res, 404, "NOT_FOUND");
    req.room = r.rows[0];
    next();
  } catch (e) {
    next(e);
  }
}
async function publish(roomId) {
  const { rows } = await pool.query(
    "SELECT user_id FROM members WHERE room_id=$1",
    [roomId],
  );
  for (const row of rows)
    for (const res of live.get(row.user_id) || [])
      res.write(`data: ${JSON.stringify({ roomId })}\n\n`);
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
  const ping = setInterval(() => res.write(": heartbeat\n\n"), 25000);
  const expire = setTimeout(
    () => res.end(),
    Math.min(
      10 * 60000,
      Math.max(1000, new Date(req.session.expiresAt) - Date.now()),
    ),
  );
  req.on("close", () => {
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
      `SELECT r.id,r.name,r.description,r.color,r.image,r.owner_id AS "ownerId",r.invite_code AS "inviteCode",(SELECT count(*)::int FROM members WHERE room_id=r.id) AS "memberCount",(SELECT text FROM messages WHERE room_id=r.id ORDER BY created_at DESC LIMIT 1) AS "lastText",(SELECT max(created_at) FROM messages WHERE room_id=r.id) AS "lastAt",(SELECT count(*)::int FROM messages WHERE room_id=r.id AND created_at>m.last_read_at AND sender_id<>$1) AS unread FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY coalesce((SELECT max(created_at) FROM messages WHERE room_id=r.id),r.created_at) DESC LIMIT 100`,
      [req.user.id],
    )
  ).rows;
  const events = (
    await pool.query(
      `SELECT e.id,e.room_id AS "roomId",e.creator_id AS "creatorId",e.title,e.description,e.location,e.starts_at AS "startsAt",e.ends_at AS "endsAt",e.color,e.cancelled,r.name AS "roomName",COALESCE((SELECT json_agg(json_build_object('userId',v.user_id,'name',u.name,'status',v.status)) FROM rsvps v JOIN "user" u ON u.id=v.user_id WHERE v.event_id=e.id),'[]') AS rsvps FROM events e JOIN rooms r ON r.id=e.room_id JOIN members m ON m.room_id=e.room_id WHERE m.user_id=$1 AND e.starts_at>now()-interval '1 year' AND e.starts_at<now()+interval '2 years' ORDER BY e.starts_at LIMIT 1000`,
      [req.user.id],
    )
  ).rows;
  res.json({ user: req.user, rooms, events });
});
app.post("/api/rooms", async (req, res) => {
  const data = roomInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const id = randomUUID(),
    code = randomBytes(18).toString("base64url");
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
    await pool.query("SELECT id FROM rooms WHERE invite_code=$1", [
      req.body.code,
    ])
  ).rows[0];
  if (!room) return jsonError(res, 404, "INVITE_NOT_FOUND");
  await pool.query(
    "INSERT INTO members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [room.id, req.user.id],
  );
  await publish(room.id);
  res.json({ id: room.id });
});
app.get("/api/rooms/:room/messages", member, async (req, res) => {
  const before =
    typeof req.query.before === "string" && !isNaN(Date.parse(req.query.before))
      ? req.query.before
      : null;
  const q=String(req.query.q||"").trim().slice(0,120),kind=String(req.query.kind||"all");
  const from=typeof req.query.from==="string"&&!isNaN(Date.parse(req.query.from))?req.query.from:null;
  const to=typeof req.query.to==="string"&&!isNaN(Date.parse(req.query.to))?req.query.to:null;
  const messages = (
    await pool.query(
      `SELECT m.id,m.text,m.reply_to AS "replyTo",(SELECT CASE WHEN p.deleted THEN 'Mensagem removida' ELSE left(p.text,200) END FROM messages p WHERE p.id=m.reply_to) AS "replyText",m.edited_at AS "editedAt",m.deleted,m.pinned,m.event_id AS "eventId",m.sender_id AS "senderId",u.name AS "senderName",u.image AS "senderImage",(SELECT json_build_object('id',a.id,'name',a.name,'mime',a.mime,'size',a.size,'width',a.width,'height',a.height) FROM media a WHERE a.id=m.attachment_id) AS attachment,m.created_at AS "createdAt",COALESCE((SELECT json_agg(json_build_object('userId',r.user_id,'emoji',r.emoji)) FROM reactions r WHERE r.message_id=m.id),'[]') AS reactions FROM messages m JOIN "user" u ON u.id=m.sender_id WHERE m.room_id=$1 AND ($2::timestamptz IS NULL OR m.created_at<$2) AND ($3::timestamptz IS NULL OR m.created_at>=$3) AND ($4::timestamptz IS NULL OR m.created_at<$4) AND ($5='' OR m.text ILIKE '%'||$5||'%') AND ($6='all' OR ($6='pinned' AND m.pinned) OR EXISTS(SELECT 1 FROM media a WHERE a.id=m.attachment_id AND (($6='files' AND a.mime !~ '^(image|video|audio)/') OR a.mime LIKE $6||'/%'))) ORDER BY m.created_at DESC,m.id DESC LIMIT 80`,
      [req.params.room, before,from,to,q,kind],
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
  if(data.data.replyTo){const r=await pool.query("SELECT id FROM messages WHERE id=$1 AND room_id=$2 AND NOT deleted",[data.data.replyTo,req.params.room]);if(!r.rowCount)return jsonError(res,400,"INVALID_INPUT");}
  if (data.data.attachmentId) {
    const a = await pool.query("SELECT id FROM media WHERE id=$1 AND owner_id=$2 AND room_id=$3", [data.data.attachmentId,req.user.id,req.params.room]);
    if (!a.rowCount) return jsonError(res,400,"INVALID_INPUT");
  }
  const r = await pool.query(
    "INSERT INTO messages(id,room_id,sender_id,text,attachment_id,reply_to) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id",
    [data.data.id, req.params.room, req.user.id, data.data.text, data.data.attachmentId || null,data.data.replyTo || null],
  );
  if (!r.rowCount) {
    const existing = (
      await pool.query("SELECT room_id,sender_id FROM messages WHERE id=$1", [
        data.data.id,
      ])
    ).rows[0];
    if (
      existing?.room_id !== req.params.room ||
      existing?.sender_id !== req.user.id
    )
      return jsonError(res, 409, "CONFLICT");
  }
  await publish(req.params.room);
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
    const m = (
      await pool.query("SELECT id FROM messages WHERE id=$1 AND room_id=$2", [
        req.params.message,
        req.params.room,
      ])
    ).rows[0];
    if (!m) return jsonError(res, 404, "NOT_FOUND");
    const removed = await pool.query(
      "DELETE FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3 RETURNING emoji",
      [m.id, req.user.id, data.data.emoji],
    );
    if (!removed.rowCount)
      await pool.query(
        "INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [m.id, req.user.id, data.data.emoji],
      );
    await publish(req.params.room);
    res.json({ ok: true });
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
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
  await publish(req.params.room);
  res.status(201).json({ id });
});
app.put("/api/rooms/:room/events/:event", member, async (req, res) => {
  const data = eventInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const e = data.data;
  const r = await pool.query(
    "UPDATE events SET title=$1,description=$2,location=$3,starts_at=$4,ends_at=$5,color=$6 WHERE id=$7 AND room_id=$8 AND creator_id=$9 RETURNING id",
    [
      e.title,
      e.description,
      e.location,
      e.startsAt,
      e.endsAt,
      e.color,
      req.params.event,
      req.params.room,
      req.user.id,
    ],
  );
  if (!r.rowCount) return jsonError(res, 403, "FORBIDDEN");
  await publish(req.params.room);
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
  res.json({ ok: true });
});
app.delete("/api/rooms/:room/events/:event", member, async (req, res) => {
  const r = await pool.query(
    "UPDATE events SET cancelled=true WHERE id=$1 AND room_id=$2 AND creator_id=$3 RETURNING id",
    [req.params.event, req.params.room, req.user.id],
  );
  if (!r.rowCount) return jsonError(res, 403, "FORBIDDEN");
  await publish(req.params.room);
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
  const id=randomUUID(); const c=await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[req.user.id]);
    const quota=await c.query("SELECT coalesce(sum(size),0)::bigint AS total FROM media WHERE owner_id=$1",[req.user.id]);
    if(Number(quota.rows[0].total)+req.body.length>100*1048576){await c.query("ROLLBACK");return jsonError(res,413,"STORAGE_FULL");}
    await c.query("INSERT INTO media(id,owner_id,room_id,name,mime,size,bytes,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,req.user.id,roomId,name,mime,req.body.length,req.body,width||null,height||null]);
    if(avatar){
      const url="/api/media/"+id;
      if(roomId)await c.query("UPDATE rooms SET image=$1 WHERE id=$2",[url,roomId]);
      else await c.query('UPDATE "user" SET image=$1 WHERE id=$2',[url,req.user.id]);
    }
    await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
  if(roomId)await publish(roomId);
  res.status(201).json({id,image:"/api/media/"+id,name,mime,size:req.body.length,width:width||null,height:height||null});
}
app.post("/api/profile/photo",mediaBody,(req,res)=>saveMedia(req,res,null,true));
app.post("/api/rooms/:room/photo",member,(req,res,next)=>req.room.owner_id===req.user.id?next():jsonError(res,403,"FORBIDDEN"),mediaBody,(req,res)=>saveMedia(req,res,req.params.room,true));
app.post("/api/rooms/:room/files",member,mediaBody,(req,res)=>saveMedia(req,res,req.params.room,false));
app.get("/api/media/:id",async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return jsonError(res,404,"NOT_FOUND");
 const r=await pool.query(`SELECT a.* FROM media a WHERE a.id=$1 AND (a.owner_id=$2 OR EXISTS(SELECT 1 FROM members m WHERE m.room_id=a.room_id AND m.user_id=$2) OR (a.room_id IS NULL AND EXISTS(SELECT 1 FROM members me JOIN members peer ON peer.room_id=me.room_id WHERE me.user_id=$2 AND peer.user_id=a.owner_id)))`,[req.params.id,req.user.id]);
 if(!r.rowCount)return jsonError(res,404,"NOT_FOUND");
 const a=r.rows[0];res.set({"Content-Type":a.mime,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(a.name),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}).send(a.bytes);
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
  for (const set of live.values()) for (const res of set) res.end();
  server.close(() => pool.end().then(() => process.exit(0)));
});
