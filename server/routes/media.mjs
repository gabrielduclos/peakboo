import express from "express";
import {randomUUID} from "node:crypto";
import {r2,mediaKey,mediaBytes} from "../r2.mjs";

export function registerMedia(app,{pool,member,jsonError,publish,notifyUsers}){
// Binary bodies are parsed only after authentication and room membership checks.
const mediaBody = express.raw({type:()=>true,limit:"10mb"});
const videoBody = express.raw({type:()=>true,limit:"30mb"});
const isVideo=mime=>["video/mp4","video/webm","video/quicktime"].includes(mime);
const fileBody=(req,res,next)=>(isVideo((req.headers["content-type"]||"").split(";")[0])?videoBody:mediaBody)(req,res,next);
async function saveMedia(req, res, roomId, avatar) {
  const mime=(req.headers["content-type"]||"").split(";")[0];
  const allowed=new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime","audio/webm","audio/mp4","audio/ogg","audio/mpeg","audio/wav","audio/aac","audio/x-m4a","application/pdf","text/plain","application/zip","application/octet-stream","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
  if(!allowed.has(mime)|| (avatar && !["image/jpeg","image/png","image/webp","image/gif"].includes(mime)) || !Buffer.isBuffer(req.body)||!req.body.length || req.body.length>(avatar?1048576:isVideo(mime)?30*1048576:10*1048576))return jsonError(res,400,"INVALID_INPUT");
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
app.post("/api/rooms/:room/files",member,fileBody,(req,res)=>saveMedia(req,res,req.params.room,false));
app.get("/api/media/:id",async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return jsonError(res,404,"NOT_FOUND");
 const r=await pool.query(`SELECT a.id,a.mime,a.name,a.r2_key,CASE WHEN a.r2_key IS NULL THEN a.bytes ELSE NULL END AS bytes FROM media a WHERE a.id=$1 AND ((a.room_id IS NOT NULL AND EXISTS(SELECT 1 FROM rooms r JOIN members m ON m.room_id=r.id WHERE r.id=a.room_id AND r.kind='group' AND m.user_id=$2 AND (r.image='/api/media/'||a.id::text OR (a.owner_id=$2 AND a.created_at>=m.joined_at) OR EXISTS(SELECT 1 FROM messages msg WHERE msg.room_id=r.id AND msg.attachment_id=a.id AND NOT msg.deleted AND msg.created_at>=m.joined_at)))) OR (a.room_id IS NULL AND (a.owner_id=$2 OR (EXISTS(SELECT 1 FROM "user" u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=a.owner_id AND (u.image='/api/media/'||a.id::text OR p.cover='/api/media/'||a.id::text)) AND EXISTS(SELECT 1 FROM members me JOIN members peer ON peer.room_id=me.room_id JOIN rooms r ON r.id=me.room_id WHERE r.kind='group' AND me.user_id=$2 AND peer.user_id=a.owner_id)))))`,[req.params.id,req.user.id]);
 if(!r.rowCount)return jsonError(res,404,"NOT_FOUND");
 const a=r.rows[0];let bytes;try{bytes=await mediaBytes(a)}catch(e){if(!a.r2_key)throw e;const legacy=(await pool.query("SELECT bytes FROM media WHERE id=$1",[a.id])).rows[0]?.bytes;if(!legacy)throw e;bytes=legacy;}res.set({"Content-Type":a.mime,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(a.name),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}).send(bytes);
});
}
