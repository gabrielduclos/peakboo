// Read/dismiss flags are monotonic, private to the authenticated account and idempotent.
const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const iso="\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z";
const noticePattern=new RegExp("^(?:(?:activity|reaction):"+uuid+"|reminder:"+uuid+":"+iso+":(?:15|60)|room:"+uuid+":(?:"+iso+")?:[1-9]\\d{0,9})$","i");
const validIds=ids=>Array.isArray(ids)&&ids.length<=100&&ids.every(id=>typeof id==="string"&&id.length<=160&&noticePattern.test(id));
const isoDate=value=>value?new Date(value).toISOString():"";
export async function loadNotificationState(pool,userId,{rooms,events,activity,reactionNotices}){
 const ids=[...activity.map(a=>"activity:"+a.id),...reactionNotices.map(n=>"reaction:"+n.id),
  ...rooms.filter(r=>r.unread>0).map(r=>"room:"+r.id+":"+isoDate(r.lastAt)+":"+r.unread),
  ...events.filter(e=>!e.cancelled).flatMap(e=>[60,15].map(minutes=>"reminder:"+e.id+":"+isoDate(e.startsAt)+":"+minutes))];
 if(!ids.length)return {read:[],dismissed:[]};
 const {rows}=await pool.query("SELECT notice_id,seen,dismissed FROM notification_state WHERE user_id=$1 AND notice_id=ANY($2::text[])",[userId,ids]);
 return {read:rows.filter(r=>r.seen).map(r=>r.notice_id),dismissed:rows.filter(r=>r.dismissed).map(r=>r.notice_id)};
}
export function registerNotifications(app,{pool,jsonError,notifyAccount}){
 app.post("/api/notifications/state",async(req,res)=>{
  const {read,dismissed}=req.body||{};
  if(!validIds(read)||!validIds(dismissed)||Object.keys(req.body||{}).some(k=>k!=="read"&&k!=="dismissed"))return jsonError(res,400,"INVALID_INPUT");
  const ids=[...new Set([...read,...dismissed])];
  if(!ids.length)return res.json({ok:true});
  const result=await pool.query(`INSERT INTO notification_state(user_id,notice_id,seen,dismissed)
   SELECT $1,id,id=ANY($3::text[]) OR id=ANY($4::text[]),id=ANY($4::text[]) FROM unnest($2::text[]) AS t(id)
   ON CONFLICT(user_id,notice_id) DO UPDATE SET seen=notification_state.seen OR EXCLUDED.seen,dismissed=notification_state.dismissed OR EXCLUDED.dismissed
   WHERE (EXCLUDED.seen AND NOT notification_state.seen) OR (EXCLUDED.dismissed AND NOT notification_state.dismissed)`,[req.user.id,ids,read,dismissed]);
  if(result.rowCount)notifyAccount(req.user.id,{notificationStateChanged:true});
  res.json({ok:true});
 });
}
