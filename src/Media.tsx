import {useEffect,useState} from 'react';
import {API,getToken} from './api';
export async function uploadMedia(path:string,file:File){
 const r=await fetch(API+path+'?name='+encodeURIComponent(file.name),{method:'POST',headers:{Authorization:'Bearer '+getToken(),'Content-Type':file.type||'application/octet-stream'},body:file});
 const data=await r.json();if(!r.ok)throw Error(data.error||'SERVER_ERROR');return data;
}
export async function photoFile(file:File){
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('INVALID_INPUT');
 const bitmap=await createImageBitmap(file);const c=document.createElement('canvas');c.width=c.height=384;
 const size=Math.min(bitmap.width,bitmap.height);c.getContext('2d')!.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,384,384);bitmap.close();
 const b=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/webp',.85));if(!b)throw Error('INVALID_INPUT');return new File([b],'perfil.webp',{type:b.type});
}
function demoDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('peakboo-demo-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function localFile(file:File):Promise<string>{const db=await demoDB();const id=crypto.randomUUID();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});return '/demo-media/'+id;}finally{db.close()}}
async function readLocal(src:string){const db=await demoDB();try{return await new Promise<Blob>((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(src.slice('/demo-media/'.length));r.onsuccess=()=>r.result?resolve(r.result):reject(Error());r.onerror=()=>reject(r.error)})}finally{db.close()}}
function useMedia(src?:string|null){
 const [url,setUrl]=useState('');
 useEffect(()=>{setUrl('');if(!src)return;if(src.startsWith('data:')||src.startsWith('blob:')){setUrl(src);return;}
 if(src.startsWith('/demo-media/')){let live=true,object='';readLocal(src).then(b=>{if(live){object=URL.createObjectURL(b);setUrl(object)}}).catch(()=>{});return()=>{live=false;if(object)URL.revokeObjectURL(object)}}
 if(!/^\/api\/media\/[a-f0-9-]{36}$/i.test(src))return;
 const abort=new AbortController();let object='';
 fetch(API+src,{headers:{Authorization:'Bearer '+getToken()},signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.blob()}).then(b=>{if(!abort.signal.aborted){object=URL.createObjectURL(b);setUrl(object)}}).catch(()=>{});
 return()=>{abort.abort();if(object)URL.revokeObjectURL(object)};
 },[src]);return url;
}
export function AvatarPhoto({src}:{src:string}){const url=useMedia(src);return url?<img src={url} alt="" className="avatar-photo"/>:null;}
export function ChatAudioPlayer({src}:{src:string;name?:string}){return <audio controls preload="metadata" src={src} className="max-w-full"/>;}
export function MessageMedia({attachment}:{attachment?:{id:string;name:string;mime:string;size:number;url?:string}}){
 const src=useMedia(attachment?.url|| (attachment?'/api/media/'+attachment.id:null));
 if(!attachment)return null;
 return <div className="message-media">{!src?<span role="status">…</span>:<>
 {attachment.mime.startsWith('image/')?<a href={src} target="_blank" rel="noreferrer"><img src={src} alt={attachment.name} loading="lazy"/></a>:attachment.mime.startsWith('video/')?<video controls preload="metadata" src={src}/>:attachment.mime.startsWith('audio/')?<ChatAudioPlayer src={src}/>:null}
 <a href={src} download={attachment.name}>{attachment.name} · {(attachment.size/1024).toFixed(0)} KB ↓</a></>}
 </div>;
}

export function MessageText({text}:{text:string}){return <>{text.split(/(https:\/\/www\.openstreetmap\.org\/[^\s]+)/g).map((part,i)=>part.startsWith('https://www.openstreetmap.org/')?<a key={i} href={part} target="_blank" rel="noreferrer">📍 OpenStreetMap</a>:part)}</>;}
