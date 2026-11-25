// Explicit, bounded, non-destructive migration. Run only after configuring the private bucket.
import {createHash} from "node:crypto";
import {pool} from "./auth.mjs";
import {migrate} from "./migrate.mjs";
import {r2,mediaKey,drainR2Deletes} from "./r2.mjs";
const hash=b=>createHash("sha256").update(b).digest("hex");
try{
 if(!r2)throw Error("R2 configuration required");
 const limit=Number(process.argv[2]||100);
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error("Pass a batch size from 1 to 1000");
 await migrate();let copied=0;
 for(let i=0;i<limit;i++){
  const db=await pool.connect();
  try{
   await db.query("BEGIN");
   const row=(await db.query("SELECT id,mime,bytes FROM media WHERE r2_key IS NULL AND bytes IS NOT NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
   if(!row){await db.query("COMMIT");break}
   const key=mediaKey(row.id);await r2.put(key,row.bytes,row.mime);const received=await r2.get(key);
   if(hash(received)!==hash(row.bytes))throw Error("R2 verification failed");
   await db.query("UPDATE media SET r2_key=$2 WHERE id=$1",[row.id,key]);await db.query("COMMIT");copied++;
  }catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
 }
 await drainR2Deletes(pool,r2,100);
 console.log("Verified and copied "+copied+" media objects; original bytes retained.");
}finally{await pool.end()}
