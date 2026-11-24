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
      `SELECT r.id,r.name,r.description,r.color,r.owner_id AS "ownerId",r.invite_code AS "inviteCode",(SELECT count(*)::int FROM members WHERE room_id=r.id) AS "memberCount",(SELECT text FROM messages WHERE room_id=r.id ORDER BY created_at DESC LIMIT 1) AS "lastText",(SELECT max(created_at) FROM messages WHERE room_id=r.id) AS "lastAt",(SELECT count(*)::int FROM messages WHERE room_id=r.id AND created_at>m.last_read_at AND sender_id<>$1) AS unread FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY coalesce((SELECT max(created_at) FROM messages WHERE room_id=r.id),r.created_at) DESC LIMIT 100`,
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
  const messages = (
    await pool.query(
      `SELECT m.id,m.text,m.event_id AS "eventId",m.sender_id AS "senderId",u.name AS "senderName",m.created_at AS "createdAt",COALESCE((SELECT json_agg(json_build_object('userId',r.user_id,'emoji',r.emoji)) FROM reactions r WHERE r.message_id=m.id),'[]') AS reactions FROM messages m JOIN "user" u ON u.id=m.sender_id WHERE m.room_id=$1 AND ($2::timestamptz IS NULL OR m.created_at<$2) ORDER BY m.created_at DESC,m.id DESC LIMIT 80`,
      [req.params.room, before],
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
        'SELECT u.id,u.name FROM members m JOIN "user" u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.joined_at',
        [req.params.room],
      )
    ).rows,
  }),
);
app.post("/api/rooms/:room/messages", member, async (req, res) => {
  const data = messageInput.safeParse(req.body);
  if (!data.success) return jsonError(res, 400, "INVALID_INPUT");
  const r = await pool.query(
    "INSERT INTO messages(id,room_id,sender_id,text) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id",
    [data.data.id, req.params.room, req.user.id, data.data.text],
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
app.use("/api", (_, res) => jsonError(res, 404, "NOT_FOUND"));
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*splat}", (_, res) => res.sendFile(path.join(dist, "index.html")));
}
app.use((err, req, res, next) => {
  console.error("Request failed:", err.code || err.name);
  if (!res.headersSent)
    jsonError(
      res,
      err.type === "entity.parse.failed" ? 400 : 500,
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
