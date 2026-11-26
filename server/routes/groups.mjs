import {randomUUID,randomBytes} from "node:crypto";
import {roomInput} from "../validation.mjs";
import {r2,drainR2Deletes} from "../r2.mjs";

export function registerGroups(app,{pool,member,jsonError,publish,push,live}){
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
}

export function registerGroupMembership(app,{pool,member,notifyAccount}){
app.post("/api/rooms/:room/read", member, async (req, res) => {
  const changed=await pool.query(
    `UPDATE members m SET last_read_at=now() WHERE m.room_id=$1 AND m.user_id=$2
      AND EXISTS(SELECT 1 FROM messages msg WHERE msg.room_id=m.room_id AND msg.sender_id<>m.user_id AND msg.created_at>m.last_read_at AND msg.created_at>=m.joined_at)`,
    [req.params.room, req.user.id],
  );
  // Reading a room acknowledges reactions independently of message timestamps.
  const reactionState=await pool.query(`WITH candidates AS (
    SELECT 'reaction:'||rx.activity_id::text AS notice_id
    FROM reactions rx JOIN messages msg ON msg.id=rx.message_id
    JOIN members m ON m.room_id=msg.room_id AND m.user_id=$2
    JOIN rooms r ON r.id=m.room_id
    WHERE msg.room_id=$1 AND r.kind='group' AND msg.sender_id=$2 AND rx.user_id<>$2
      AND NOT msg.deleted AND msg.created_at>=m.joined_at AND rx.changed_at>=m.joined_at
      AND rx.changed_at>now()-interval '30 days' AND rx.activity_id IS NOT NULL
  ), written AS (
    INSERT INTO notification_state(user_id,notice_id,seen,dismissed)
    SELECT $2,notice_id,true,false FROM candidates
    ON CONFLICT(user_id,notice_id) DO UPDATE SET seen=true WHERE NOT notification_state.seen
    RETURNING notice_id
  )
  SELECT ARRAY(SELECT notice_id FROM candidates) AS ids, (SELECT count(*)::int FROM written) AS changed`,[req.params.room,req.user.id]);
  const reactionRead=reactionState.rows[0]?.ids||[];
  if(changed.rowCount||reactionState.rows[0]?.changed)notifyAccount(req.user.id,{notificationStateChanged:true});
  res.json({ ok: true,reactionRead });
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
}
