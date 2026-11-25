export function createRealtime(pool){
const live = new Map();
function sendLive(id,event){for(const response of live.get(id)||[]){if(response.destroyed||response.writableEnded)continue;try{if(!response.write("data: "+JSON.stringify(event)+"\n\n"))response.end()}catch{response.end()}}}
async function notifyUsers(userId){
 const {rows}=await pool.query("SELECT DISTINCT peer.user_id FROM members me JOIN members peer ON peer.room_id=me.room_id JOIN rooms r ON r.id=me.room_id WHERE me.user_id=$1 AND r.kind='group'",[userId]);
 for(const id of new Set([userId,...rows.map(r=>r.user_id)]))sendLive(id,{profileChanged:true});
}
async function publish(roomId,change={}){
 if(!live.size)return;
 const {rows}=await pool.query("SELECT m.user_id FROM members m JOIN rooms r ON r.id=m.room_id WHERE r.id=$1 AND r.kind='group' AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM messages msg WHERE msg.id=$2 AND msg.room_id=r.id AND msg.created_at>=m.joined_at))",[roomId,change.reaction?.messageId||change.listChange?.messageId||null]);
 for(const row of rows)sendLive(row.user_id,{roomId,...change});
}
function register(app){
app.get("/api/live", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "private, no-store",
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
}
function close(){for (const set of live.values()) for (const res of set) res.end();}
return {live,publish,notifyUsers,notifyAccount:sendLive,register,close};
}
