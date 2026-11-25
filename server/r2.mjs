import {createHash,createHmac} from "node:crypto";
const hash=value=>createHash("sha256").update(value).digest("hex");
const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
const names=["R2_ACCOUNT_ID","R2_BUCKET","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY"];
export function r2Config(env=process.env){
 if(!names.some(n=>env[n]))return null;
 if(!names.every(n=>env[n]))throw Error("Incomplete R2 configuration");
 if(!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET))throw Error("Invalid R2 account or bucket");
 const jurisdiction=env.R2_JURISDICTION||"";
 if(!["","eu","us","fedramp"].includes(jurisdiction))throw Error("Invalid R2 jurisdiction");
 return {host:env.R2_ACCOUNT_ID+(jurisdiction?"."+jurisdiction:"")+".r2.cloudflarestorage.com",bucket:env.R2_BUCKET,access:env.R2_ACCESS_KEY_ID,secret:env.R2_SECRET_ACCESS_KEY};
}
export function mediaKey(id){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error("Invalid media ID");return "media/"+id.toLowerCase()}
export function signedRequest(config,method,key,body,mime,now=new Date()){
 if(!/^media\/[a-f0-9-]{36}$/i.test(key))throw Error("Invalid object key");
 const path="/"+config.bucket+"/"+key;
 const date=now.toISOString().replace(/[:-]|\.\d{3}/g,""),day=date.slice(0,8),payload=hash(body||"");
 const headers={"host":config.host,"x-amz-content-sha256":payload,"x-amz-date":date};
 if(mime)headers["content-type"]=mime;
 const names=Object.keys(headers).sort(),signed=names.join(";"),canonical=names.map(k=>k+":"+headers[k].trim()+"\n").join("");
 const request=[method,path,"",canonical,signed,payload].join("\n");
 const scope=day+"/auto/s3/aws4_request",stringToSign=["AWS4-HMAC-SHA256",date,scope,hash(request)].join("\n");
 const signingKey=hmac(hmac(hmac(hmac("AWS4"+config.secret,day),"auto"),"s3"),"aws4_request");
 headers.authorization="AWS4-HMAC-SHA256 Credential="+config.access+"/"+scope+", SignedHeaders="+signed+", Signature="+hmac(signingKey,stringToSign).toString("hex");
 return {url:"https://"+config.host+path,options:{method,headers,...(body?{body}:{}),redirect:"error",signal:AbortSignal.timeout(20000)}};
}
export function createR2(config=r2Config(),fetcher=fetch){
 if(!config)return null;
 const send=async(method,key,body,mime)=>{
  const r=signedRequest(config,method,key,body,mime);const response=await fetcher(r.url,r.options);
  if(!response.ok&&!(method==="DELETE"&&response.status===404)){await response.body?.cancel();throw Error("R2_"+method+"_"+response.status)}
  return response;
 };
 return {put:async(key,bytes,mime)=>{const r=await send("PUT",key,bytes,mime);await r.body?.cancel()},get:async(key)=>Buffer.from(await (await send("GET",key)).arrayBuffer()),delete:async(key)=>{const r=await send("DELETE",key);await r.body?.cancel()}};
}
export const r2=createR2();
export async function mediaBytes(row,storage=r2){
 if(row.r2_key&&storage){try{return await storage.get(row.r2_key)}catch(e){if(!row.bytes)throw e}}
 if(row.bytes)return row.bytes;
 throw Error("MEDIA_STORAGE_UNAVAILABLE");
}
export async function drainR2Deletes(pool,storage=r2,limit=20){
 if(!storage)return;
 const {rows}=await pool.query("SELECT object_key FROM r2_delete_queue ORDER BY queued_at LIMIT $1",[limit]);
 for(const row of rows){try{await storage.delete(row.object_key);await pool.query("DELETE FROM r2_delete_queue WHERE object_key=$1",[row.object_key])}catch{console.error("R2 object cleanup pending");break}}
}
