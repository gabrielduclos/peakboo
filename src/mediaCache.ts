// Private, immutable media IDs are scoped to the authenticated session.
// Retain the existing database/store names to reuse previously cached audio.
export const MEDIA_CACHE_LIMIT=128*1024*1024,MEDIA_CACHE_ENTRIES=512,MEDIA_CACHE_TTL=7*24*60*60*1000;
export const MEDIA_CACHE_MAX_FILE=30*1024*1024;
const LIMIT=MEDIA_CACHE_LIMIT,MAX_ENTRIES=MEDIA_CACHE_ENTRIES,TTL=MEDIA_CACHE_TTL;
export function cacheableMedia(blob:Blob){return !!blob.size&&blob.size<=MEDIA_CACHE_MAX_FILE&&(/^(image|audio|video)\//.test(blob.type)||/^(application|text)\//.test(blob.type));}
const priority=(entry:Entry)=>entry.blob.type.startsWith('image/')&&entry.size<=1024*1024?1:0;
type Entry={key:string;blob:Blob;size:number;created:number;used:number};
function openDB():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('peakboo-audio-cache-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('audio',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('CACHE_BLOCKED'));
 });
}
export async function mediaCacheKey(account:string,token:string,src:string):Promise<string|null>{
 if(!account||!token||!/^\/api\/media\/[a-f0-9-]{36}$/i.test(src)||!globalThis.crypto?.subtle)return null;
 try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([account,token])));
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')+':'+src;}catch{return null}
}
export async function readMediaCache(key:string):Promise<Blob|null>{
 let db:IDBDatabase|undefined;
 try{db=await openDB();return await new Promise<Blob|null>((resolve,reject)=>{
  const tx=db!.transaction('audio','readwrite'),store=tx.objectStore('audio'),request=store.get(key);let blob:Blob|null=null;
  request.onsuccess=()=>{const entry=request.result as Entry|undefined;if(!entry)return;
   if(Date.now()-entry.created>=TTL||!entry.blob||!cacheableMedia(entry.blob)){store.delete(key);return}
   blob=entry.blob;store.put({...entry,used:Date.now()});
  };
  tx.oncomplete=()=>resolve(blob);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}catch{return null}finally{db?.close()}
}
export async function writeMediaCache(key:string,blob:Blob):Promise<void>{
 if(!cacheableMedia(blob))return;
 let db:IDBDatabase|undefined;
 try{db=await openDB();await new Promise<void>((resolve,reject)=>{
  const tx=db!.transaction('audio','readwrite'),store=tx.objectStore('audio'),now=Date.now();
  const entries=store.getAll();entries.onsuccess=()=>{
   const old=(entries.result as Entry[]).filter(e=>e.key!==key).sort((a,b)=>priority(b)-priority(a)||b.used-a.used);
   let size=blob.size,count=1;
   for(const e of old){if(now-e.created>=TTL||size+e.size>LIMIT||count>=MAX_ENTRIES)store.delete(e.key);else{size+=e.size;count++}}
   store.put({key,blob,size:blob.size,created:now,used:now} satisfies Entry);
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}catch{/* Storage limits or private browsing must not prevent playback. */}finally{db?.close()}
}

export async function clearMediaCache():Promise<void>{
 let db:IDBDatabase|undefined;
 try{if(typeof indexedDB==='undefined')return;db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db!.transaction('audio','readwrite');tx.objectStore('audio').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}catch{}finally{db?.close()}
}
