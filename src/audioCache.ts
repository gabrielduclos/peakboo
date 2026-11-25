// Private voice notes are cached only for the authenticated session that downloaded them.
const LIMIT=64*1024*1024,MAX_ENTRIES=120,TTL=24*60*60*1000;
type Entry={key:string;blob:Blob;size:number;created:number;used:number};
function openDB():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('peakboo-audio-cache-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('audio',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('CACHE_BLOCKED'));
 });
}
export async function audioCacheKey(account:string,token:string,src:string):Promise<string|null>{
 if(!account||!token||!/^\/api\/media\/[a-f0-9-]{36}$/i.test(src)||!globalThis.crypto?.subtle)return null;
 try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([account,token])));
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')+':'+src;}catch{return null}
}
export async function readAudioCache(key:string):Promise<Blob|null>{
 let db:IDBDatabase|undefined;
 try{db=await openDB();return await new Promise<Blob|null>((resolve,reject)=>{
  const tx=db!.transaction('audio','readwrite'),store=tx.objectStore('audio'),request=store.get(key);let blob:Blob|null=null;
  request.onsuccess=()=>{const entry=request.result as Entry|undefined;if(!entry)return;
   if(Date.now()-entry.created>=TTL||!entry.blob?.size){store.delete(key);return}
   blob=entry.blob;store.put({...entry,used:Date.now()});
  };
  tx.oncomplete=()=>resolve(blob);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}catch{return null}finally{db?.close()}
}
export async function writeAudioCache(key:string,blob:Blob):Promise<void>{
 if(!blob.size||blob.size>LIMIT||!blob.type.startsWith('audio/'))return;
 let db:IDBDatabase|undefined;
 try{db=await openDB();await new Promise<void>((resolve,reject)=>{
  const tx=db!.transaction('audio','readwrite'),store=tx.objectStore('audio'),now=Date.now();
  const entries=store.getAll();entries.onsuccess=()=>{
   const old=(entries.result as Entry[]).filter(e=>e.key!==key).sort((a,b)=>b.used-a.used);
   let size=blob.size,count=1;
   for(const e of old){if(now-e.created>=TTL||size+e.size>LIMIT||count>=MAX_ENTRIES)store.delete(e.key);else{size+=e.size;count++}}
   store.put({key,blob,size:blob.size,created:now,used:now} satisfies Entry);
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}catch{/* Storage limits or private browsing must not prevent playback. */}finally{db?.close()}
}
