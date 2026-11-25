import {z} from "zod";
import {randomUUID} from "node:crypto";
import {applyChecklistOperation,suggestChecklist} from "../../shared/checklists.mjs";
const title=z.string().trim().min(1).max(80);
const item=z.string().trim().min(1).max(200);
const id=z.string().uuid();
const create=z.object({id,title,items:z.array(item).min(1).max(50)});
const convert=z.object({title,items:z.array(item).min(1).max(50),originalText:z.string().max(4000)});
const operation=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("add"),id,text:item}),z.object({kind:z.literal("edit"),id,text:item}),
 z.object({kind:z.literal("toggle"),id,done:z.boolean()}),z.object({kind:z.literal("remove"),id}),
 z.object({kind:z.literal("rename"),title})
]);
const makeList=({title,items})=>({title,version:1,items:items.map(text=>({id:randomUUID(),text,done:false}))});
export function registerLists(app,{pool,member,jsonError,publish,push}){
 const root="/api/rooms/:room";
 app.post(root+"/lists",member,async(req,res)=>{
   const parsed=create.safeParse(req.body);if(!parsed.success)return jsonError(res,400,"INVALID_INPUT");
   const data=parsed.data,list=makeList(data);
   const r=await pool.query("INSERT INTO messages(id,room_id,sender_id,text,checklist) SELECT $1,$2,$3,$4,$5::jsonb FROM members WHERE room_id=$2 AND user_id=$3 ON CONFLICT(id) DO NOTHING RETURNING checklist",[data.id,req.params.room,req.user.id,data.title,JSON.stringify(list)]);
   if(!r.rowCount){
     const old=await pool.query("SELECT checklist FROM messages WHERE id=$1 AND room_id=$2 AND sender_id=$3 AND NOT deleted AND created_at >= $4::timestamptz AND checklist IS NOT NULL",[data.id,req.params.room,req.user.id,req.room.member_joined_at]);
     if(!old.rowCount)return jsonError(res,409,"CONFLICT");
     return res.status(200).json({id:data.id,checklist:old.rows[0].checklist});
   }
   await publish(req.params.room);
   push.notify({kind:"message",roomId:req.params.room,actorId:req.user.id,messageId:data.id,body:data.title});
   res.status(201).json({id:data.id,checklist:list});
 });
 app.post(root+"/messages/:message/list",member,async(req,res)=>{
   const data=convert.safeParse(req.body);if(!data.success||!suggestChecklist(data.data.originalText))return jsonError(res,400,"INVALID_INPUT");
   const list=makeList(data.data);
   const r=await pool.query("UPDATE messages m SET checklist=$1::jsonb WHERE m.id=$2 AND m.room_id=$3 AND m.sender_id=$4 AND m.text=$5 AND NOT m.deleted AND m.event_id IS NULL AND m.attachment_id IS NULL AND m.checklist IS NULL AND EXISTS(SELECT 1 FROM members WHERE room_id=m.room_id AND user_id=$4 AND m.created_at>=joined_at) RETURNING checklist",[JSON.stringify(list),req.params.message,req.params.room,req.user.id,data.data.originalText]);
   if(!r.rowCount){
     const old=await pool.query("SELECT checklist FROM messages WHERE id=$1 AND room_id=$2 AND sender_id=$3 AND NOT deleted AND created_at >= $4::timestamptz AND checklist IS NOT NULL",[req.params.message,req.params.room,req.user.id,req.room.member_joined_at]);
     if(!old.rowCount)return jsonError(res,409,"CONFLICT");
     return res.json({id:req.params.message,checklist:old.rows[0].checklist});
   }
   await publish(req.params.room,{listChange:{messageId:req.params.message,checklist:list}});
   res.json({id:req.params.message,checklist:list});
 });
 app.put(root+"/messages/:message/list",member,async(req,res)=>{
   const data=operation.safeParse(req.body);if(!data.success)return jsonError(res,400,"INVALID_INPUT");
   const db=await pool.connect();let list;
   try{
     await db.query("BEGIN");
     const r=await db.query("SELECT m.checklist FROM messages m JOIN members v ON v.room_id=m.room_id AND v.user_id=$3 WHERE m.id=$1 AND m.room_id=$2 AND m.created_at>=v.joined_at AND NOT m.deleted AND m.checklist IS NOT NULL FOR UPDATE OF m,v",[req.params.message,req.params.room,req.user.id]);
     if(!r.rowCount){await db.query("ROLLBACK");return jsonError(res,404,"NOT_FOUND")}
     try{list=applyChecklistOperation(r.rows[0].checklist,data.data)}catch(e){await db.query("ROLLBACK");return jsonError(res,e.message==="NOT_FOUND"?404:400,e.message==="NOT_FOUND"?"NOT_FOUND":"INVALID_INPUT")}
     if(list.version!==r.rows[0].checklist.version)await db.query("UPDATE messages SET checklist=$1::jsonb WHERE id=$2",[JSON.stringify(list),req.params.message]);
     await db.query("COMMIT");
   }catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
   await publish(req.params.room,{listChange:{messageId:req.params.message,checklist:list}});
   res.json({id:req.params.message,checklist:list});
 });
 // Refresh only already-visible older lists after reconnect. No periodic queries.
 app.post(root+"/lists/refresh",member,async(req,res)=>{
   const parsed=z.object({ids:z.array(id).max(100)}).safeParse(req.body);if(!parsed.success)return jsonError(res,400,"INVALID_INPUT");
   const r=await pool.query("SELECT id,CASE WHEN NOT deleted THEN checklist END AS checklist,deleted FROM messages WHERE room_id=$1 AND id=ANY($2::uuid[]) AND created_at >= $3::timestamptz AND (deleted OR checklist IS NOT NULL)",[req.params.room,parsed.data.ids,req.room.member_joined_at]);
   res.json({lists:r.rows});
 });
}
