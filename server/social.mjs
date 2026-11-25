import { z } from "zod";
const profileInput=z.object({name:z.string().trim().min(2).max(80),bio:z.string().trim().max(500)}).strict();
const fields=`u.id,u.name,u.image,p.bio,p.cover,u."createdAt" AS "createdAt"`;
export function privateSocial(app,pool,notify){
 app.get("/api/me/profile",async(req,res)=>{
  await pool.query("INSERT INTO profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING",[req.user.id]);
  const profile=(await pool.query(`SELECT ${fields} FROM profiles p JOIN "user" u ON u.id=p.user_id WHERE p.user_id=$1`,[req.user.id])).rows[0];
  res.set("Cache-Control","no-store").json({profile});
 });
 app.put("/api/me/profile",async(req,res)=>{
  const input=profileInput.safeParse(req.body);if(!input.success)return res.status(400).json({error:"INVALID_INPUT"});
  const db=await pool.connect();
  try{await db.query("BEGIN");await db.query("INSERT INTO profiles(user_id,bio) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,is_public=false",[req.user.id,input.data.bio]);await db.query('UPDATE "user" SET name=$2 WHERE id=$1',[req.user.id,input.data.name]);await db.query("COMMIT")}
  catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
  await notify(req.user.id);res.json({ok:true});
 });
}
