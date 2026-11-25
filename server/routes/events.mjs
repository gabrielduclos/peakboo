import {randomUUID} from "node:crypto";
import {eventInput,rsvpInput} from "../validation.mjs";

export function registerEvents(app,{pool,member,jsonError,publish,push}){
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
  const client=await pool.connect();
  let event,confirmed=false,changed=false;
  try {
    await client.query("BEGIN");
    event=(await client.query("SELECT id,title FROM events WHERE id=$1 AND room_id=$2 AND NOT cancelled FOR UPDATE",[req.params.event,req.params.room])).rows[0];
    if(!event){await client.query("ROLLBACK");return jsonError(res,404,"NOT_FOUND")}
    const result=await client.query("INSERT INTO rsvps(event_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status WHERE rsvps.status IS DISTINCT FROM excluded.status RETURNING status",[event.id,req.user.id,data.data.status]);
    changed=!!result.rowCount;
    confirmed=changed&&data.data.status==="yes";
    if(confirmed)await client.query("INSERT INTO event_activity(id,event_id,actor_id,action) VALUES($1,$2,$3,'confirmed')",[randomUUID(),event.id,req.user.id]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  if(changed){await publish(req.params.room);push.reschedule()}
  if(confirmed)push.notify({kind:"confirmed",roomId:req.params.room,actorId:req.user.id,eventId:event.id,actorName:req.user.name,body:event.title});
  res.json({ok:true});
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
}
