import {randomUUID} from "node:crypto";
import {z} from "zod";
import {vapidKeys,validateSubscription,sendWebPush} from "./web-push.mjs";
const keys=vapidKeys();
const input=z.object({endpoint:z.string().max(2048),keys:z.object({p256dh:z.string().max(100),auth:z.string().max(40)}),locale:z.enum(["pt","en"]),preview:z.boolean()});
const endpointInput=z.object({endpoint:z.string().max(2048)});
const uuid=z.uuid();
const fail=(res,status,error)=>res.status(status).json({error});
const activeSession=`JOIN "session" sess ON sess.id=s.session_id AND sess."userId"=s.user_id AND sess."expiresAt">now()`;
const membership=`JOIN members mem ON mem.user_id=s.user_id AND mem.room_id=r.id LEFT JOIN push_muted_groups muted ON muted.room_id=r.id AND muted.user_id=s.user_id`;
const fields=`s.id,s.endpoint,s.p256dh,s.auth_key,s.locale,s.preview,s.user_id,r.id AS room_id,r.name AS room_name`;
export function createPush(pool){
 let enabled=!!keys,hasSubscribers=false,running=false,timer,rerun=false,stopped=false;
 const deliver=async(row,notice)=>{
  const pt=row.locale==="pt",preview=row.preview;
  const labels={message:pt?"Nova mensagem":"New message",reaction:pt?"Nova reação":"New reaction",created:pt?"Novo compromisso":"New event",updated:pt?"Compromisso atualizado":"Event updated",cancelled:pt?"Compromisso cancelado":"Event cancelled",reminder:pt?"Lembrete da agenda":"Calendar reminder"};
  const label=labels[notice.kind];
  const payload={title:preview?String(row.room_name).slice(0,100):"Peakboo",body:preview&&notice.body?String(notice.body).slice(0,220):notice.kind==="reminder"?(pt?"Compromisso em até "+notice.minutes+" minutos.":"Event in up to "+notice.minutes+" minutes."):label,roomId:row.room_id,eventId:notice.eventId||null,tag:"peakboo-"+(notice.eventId||row.room_id)};
  try{
   const status=await sendWebPush(keys,{endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_key}},payload);
   if(status===404||status===410){await pool.query("DELETE FROM push_subscriptions WHERE id=$1 AND endpoint=$2",[row.id,row.endpoint]);return true}
   if(status<200||status>=300){console.warn("Web Push delivery failed",status);return false}
   return true;
  }catch{console.warn("Web Push delivery unavailable");return false}
 };
 const batch=async(rows,fn)=>{for(let i=0;i<rows.length;i+=8)await Promise.all(rows.slice(i,i+8).map(fn))};
 const send=async(notice)=>{
  if(!enabled||!hasSubscribers)return;
  const {rows}=await pool.query(`SELECT ${fields} FROM rooms r JOIN push_subscriptions s ON s.user_id<>$2 ${activeSession} ${membership} WHERE r.id=$1 AND r.kind='group' AND muted.user_id IS NULL AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM messages msg WHERE msg.id=$3 AND msg.room_id=r.id AND NOT msg.deleted AND msg.created_at>=mem.joined_at AND ($4::boolean=false OR msg.sender_id=s.user_id)))`,[notice.roomId,notice.actorId,notice.messageId||null,notice.kind==="reaction"]);
  await batch(rows,row=>deliver(row,notice));
 };
 const schedule=(ms=250)=>{if(!enabled||stopped)return;clearTimeout(timer);if(running){rerun=true;return}timer=setTimeout(()=>void tick().catch(()=>{console.warn("Push reminder check failed");schedule(60000)}),Math.max(250,Math.min(ms,2147483647)));timer.unref()};
 const tick=async()=>{
  if(!enabled||!hasSubscribers||running||stopped)return;
  running=true;let retry=false,nextDelay=null;
  try{
   const {rows}=await pool.query(`SELECT ${fields},e.id AS event_id,e.title,e.starts_at,limits.minutes FROM events e JOIN rooms r ON r.id=e.room_id JOIN push_subscriptions s ON true ${activeSession} ${membership} CROSS JOIN (VALUES(60),(15)) AS limits(minutes) LEFT JOIN rsvps rv ON rv.event_id=e.id AND rv.user_id=s.user_id WHERE r.kind='group' AND NOT e.cancelled AND muted.user_id IS NULL AND coalesce(rv.status,'yes')<>'no' AND e.starts_at>now() AND e.starts_at<=now()+limits.minutes*interval '1 minute' AND e.starts_at>now()+(limits.minutes-10)*interval '1 minute' AND NOT EXISTS(SELECT 1 FROM push_reminders pr WHERE pr.subscription_id=s.id AND pr.event_id=e.id AND pr.starts_at=e.starts_at AND pr.minutes=limits.minutes) ORDER BY e.starts_at LIMIT 200`);
   await batch(rows,async row=>{
    const inserted=await pool.query("INSERT INTO push_reminders(subscription_id,event_id,starts_at,minutes) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING subscription_id",[row.id,row.event_id,row.starts_at,row.minutes]);
    if(!inserted.rowCount)return;
    const ok=await deliver(row,{kind:"reminder",eventId:row.event_id,minutes:row.minutes,body:(row.locale==="pt"?"Em "+row.minutes+" min: ":"In "+row.minutes+" min: ")+row.title});
    if(!ok){retry=true;await pool.query("DELETE FROM push_reminders WHERE subscription_id=$1 AND event_id=$2 AND starts_at=$3 AND minutes=$4",[row.id,row.event_id,row.starts_at,row.minutes]);}
   });
   const next=await pool.query(`SELECT min(e.starts_at-limits.minutes*interval '1 minute') AS due FROM events e JOIN rooms r ON r.id=e.room_id JOIN push_subscriptions s ON true ${activeSession} ${membership} CROSS JOIN (VALUES(60),(15)) AS limits(minutes) LEFT JOIN rsvps rv ON rv.event_id=e.id AND rv.user_id=s.user_id WHERE r.kind='group' AND NOT e.cancelled AND muted.user_id IS NULL AND coalesce(rv.status,'yes')<>'no' AND e.starts_at>now()+(limits.minutes-10)*interval '1 minute' AND NOT EXISTS(SELECT 1 FROM push_reminders pr WHERE pr.subscription_id=s.id AND pr.event_id=e.id AND pr.starts_at=e.starts_at AND pr.minutes=limits.minutes)`);
   if(next.rows[0]?.due)nextDelay=Math.max(retry?60000:250,new Date(next.rows[0].due).getTime()-Date.now());
  }finally{
   running=false;
   if(rerun){rerun=false;schedule()}
   else if(nextDelay!==null)schedule(nextDelay)
  }
 };
 return {
  register(app){
   app.get("/api/push/config",(req,res)=>res.set("Cache-Control","no-store").json({enabled,publicKey:keys?.publicKey||null}));
   app.post("/api/push/subscriptions",async(req,res)=>{
    if(!enabled)return fail(res,503,"PUSH_UNAVAILABLE");
    const parsed=input.safeParse(req.body);if(!parsed.success)return fail(res,400,"INVALID_INPUT");
    let sub;try{sub=validateSubscription(parsed.data)}catch{return fail(res,400,"INVALID_INPUT")}
    // The endpoint is a capability: overwrite only with the matching encryption keys.
    const result=await pool.query(`INSERT INTO push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth_key,locale,preview) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,locale=excluded.locale,preview=excluded.preview,updated_at=now() WHERE push_subscriptions.p256dh=excluded.p256dh AND push_subscriptions.auth_key=excluded.auth_key RETURNING id`,[randomUUID(),req.user.id,req.session.id,sub.endpoint,sub.keys.p256dh,sub.keys.auth,parsed.data.locale,parsed.data.preview]);
    if(!result.rowCount)return fail(res,409,"CONFLICT");
    hasSubscribers=true;schedule();res.json({ok:true});
   });
   app.post("/api/push/status",async(req,res)=>{
    const p=endpointInput.safeParse(req.body);if(!p.success)return fail(res,400,"INVALID_INPUT");
    const result=await pool.query("SELECT preview,locale FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2 AND session_id=$3",[p.data.endpoint,req.user.id,req.session.id]);
    res.set("Cache-Control","no-store").json({active:!!result.rowCount,preview:result.rows[0]?.preview||false});
   });
   app.delete("/api/push/subscriptions",async(req,res)=>{
    const p=endpointInput.safeParse(req.body);if(!p.success)return fail(res,400,"INVALID_INPUT");
    await pool.query("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2",[req.user.id,p.data.endpoint]);res.json({ok:true});
   });
   app.get("/api/push/muted",async(req,res)=>res.json({rooms:(await pool.query("SELECT room_id AS id FROM push_muted_groups WHERE user_id=$1",[req.user.id])).rows.map(r=>r.id)}));
   app.put("/api/push/muted/:room",async(req,res)=>{
    if(!uuid.safeParse(req.params.room).success||typeof req.body?.muted!=="boolean")return fail(res,400,"INVALID_INPUT");
    const membership=await pool.query("SELECT 1 FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.room_id=$1 AND m.user_id=$2 AND r.kind='group'",[req.params.room,req.user.id]);
    if(!membership.rowCount)return fail(res,404,"NOT_FOUND");
    if(req.body.muted)await pool.query("INSERT INTO push_muted_groups(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.room,req.user.id]);else await pool.query("DELETE FROM push_muted_groups WHERE room_id=$1 AND user_id=$2",[req.params.room,req.user.id]);
    schedule();res.json({ok:true});
   });
  },
  notify(notice){if(["created","updated","cancelled"].includes(notice.kind))schedule();void send(notice).catch(()=>console.warn("Push dispatch failed"))},
  reschedule(){schedule()},
  async start(){if(!enabled)return;hasSubscribers=!!(await pool.query("SELECT 1 FROM push_subscriptions LIMIT 1")).rowCount;if(hasSubscribers)schedule()},
  stop(){stopped=true;clearTimeout(timer)}
 };
}
