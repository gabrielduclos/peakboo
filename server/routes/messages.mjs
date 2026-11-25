import {displayName} from "../../shared/display-name.mjs";
import {randomUUID} from "node:crypto";
import {messageInput,reactionInput} from "../validation.mjs";

export function registerMessageHistory(app,{pool,member,jsonError}){
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
      `SELECT m.id,m.text,CASE WHEN NOT m.deleted THEN m.checklist END AS checklist,(SELECT p.id FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replyTo",(SELECT CASE WHEN p.deleted THEN '' ELSE p.text END FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replyText",(SELECT p.sender_id FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replySenderId",(SELECT u.name FROM messages p JOIN "user" u ON u.id=p.sender_id WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replySenderName",(SELECT p.deleted FROM messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz) AS "replyDeleted",(SELECT a.mime FROM messages p JOIN media a ON a.id=p.attachment_id WHERE p.id=m.reply_to AND p.room_id=m.room_id AND p.created_at >= $8::timestamptz AND NOT p.deleted) AS "replyMime",m.edited_at AS "editedAt",m.deleted,m.pinned,m.event_id AS "eventId",m.sender_id AS "senderId",u.name AS "senderName",u.image AS "senderImage",(SELECT json_build_object('id',a.id,'name',a.name,'mime',a.mime,'size',a.size,'width',a.width,'height',a.height) FROM media a WHERE a.id=m.attachment_id) AS attachment,m.created_at AS "createdAt",COALESCE((SELECT json_agg(json_build_object('userId',r.user_id,'emoji',r.emoji)) FROM reactions r WHERE r.message_id=m.id),'[]') AS reactions FROM messages m JOIN "user" u ON u.id=m.sender_id WHERE m.room_id=$1 AND m.created_at >= $8::timestamptz AND ($7::uuid IS NULL OR (m.created_at,m.id)<=(SELECT p.created_at,p.id FROM messages p WHERE p.id=$7 AND p.room_id=$1 AND p.created_at >= $8::timestamptz)) AND ($2::timestamptz IS NULL OR m.created_at<$2) AND ($3::timestamptz IS NULL OR m.created_at>=$3) AND ($4::timestamptz IS NULL OR m.created_at<$4) AND ($5='' OR m.text ILIKE '%'||$5||'%') AND ($6='all' OR ($6='pinned' AND m.pinned) OR EXISTS(SELECT 1 FROM media a WHERE a.id=m.attachment_id AND (($6='files' AND a.mime !~ '^(image|video|audio)/') OR a.mime LIKE $6||'/%'))) ORDER BY m.created_at DESC,m.id DESC LIMIT 80`,
      [req.params.room, before,from,to,q,kind,around,req.room.member_joined_at],
    )
  ).rows.reverse();
  res.json({ messages, hasMore: messages.length === 80 });
});
}

export function registerMessageActions(app,{pool,member,jsonError,publish,push}){
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
  if(r.rowCount)push.notify({kind:"message",roomId:req.params.room,actorId:req.user.id,messageId:data.data.id,body:displayName(req.user.name)+": "+(data.data.text||"📎")});
  res.status(201).json({ id: data.data.id });
});
app.put("/api/rooms/:room/messages/:message",member,async(req,res)=>{
 const text=typeof req.body.text==="string"?req.body.text.trim():"";
 if(!text||text.length>4000)return jsonError(res,400,"INVALID_INPUT");
 const r=await pool.query("UPDATE messages SET text=$1,edited_at=now() WHERE id=$2 AND room_id=$3 AND sender_id=$4 AND NOT deleted AND event_id IS NULL AND attachment_id IS NULL AND checklist IS NULL RETURNING id",[text,req.params.message,req.params.room,req.user.id]);
 if(!r.rowCount)return jsonError(res,403,"FORBIDDEN");await publish(req.params.room);res.json({ok:true});
});
app.delete("/api/rooms/:room/messages/:message",member,async(req,res)=>{
 const r=await pool.query("UPDATE messages SET deleted=true,text='',attachment_id=NULL,pinned=false,checklist=NULL WHERE id=$1 AND room_id=$2 AND sender_id=$3 AND event_id IS NULL AND NOT deleted RETURNING id",[req.params.message,req.params.room,req.user.id]);
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
      if(active)added=!!(await db.query("INSERT INTO reactions(message_id,user_id,emoji,changed_at,activity_id) VALUES($1,$2,$3,now(),$4) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=EXCLUDED.emoji,changed_at=EXCLUDED.changed_at,activity_id=EXCLUDED.activity_id WHERE reactions.emoji IS DISTINCT FROM EXCLUDED.emoji",[req.params.message,req.user.id,data.data.emoji,randomUUID()])).rowCount;
      else await db.query("DELETE FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3",[req.params.message,req.user.id,data.data.emoji]);
      await db.query("COMMIT");
    }catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
    const reaction={messageId:req.params.message,userId:req.user.id,emoji:data.data.emoji,active};
    await publish(req.params.room,{reaction});
    if(added)push.notify({kind:"reaction",roomId:req.params.room,actorId:req.user.id,messageId:req.params.message,body:displayName(req.user.name)+" "+data.data.emoji});
    res.json({ok:true,reaction});
  },
);
}
