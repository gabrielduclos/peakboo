import {ChatAudioPlayer} from './ChatAudioPlayer';
export {ChatAudioPlayer} from './ChatAudioPlayer';
import {useEffect,useState} from 'react';
import {API,getToken} from './api';
export async function uploadMedia(path:string,file:File){
 const dimensions=await mediaDimensions(file);
 const query=new URLSearchParams({name:file.name,...(dimensions?{width:String(dimensions.width),height:String(dimensions.height)}:{})});
 const r=await fetch(API+path+'?'+query,{method:'POST',headers:{Authorization:'Bearer '+getToken(),'Content-Type':file.type||'application/octet-stream'},body:file});
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
type Cached={url:string;size:number;checked:number;used:number};
const cache=new Map<string,Cached>();
const pending=new Map<string,Promise<string>>();
const active=new Map<string,number>();
let account='';let generation=0;
export function setMediaAccount(next:string){if(next===account)return;account=next;generation++;for(const v of cache.values())URL.revokeObjectURL(v.url);cache.clear();pending.clear();active.clear();}
function trimCache(){let total=[...cache.values()].reduce((sum,v)=>sum+v.size,0);for(const [key,v] of [...cache].sort((a,b)=>a[1].used-b[1].used)){if(total<=64*1048576&&cache.size<=160)break;if(active.get(key))continue;cache.delete(key);URL.revokeObjectURL(v.url);total-=v.size;}}
export async function cachedMedia(src:string){
 if(src.startsWith('data:')||src.startsWith('blob:'))return src;
 const token=getToken()||'';const key=account+':'+token+':'+src;const entry=cache.get(key);
 if(entry&&Date.now()-entry.checked<300000){entry.used=Date.now();return entry.url;}
 const current=pending.get(key);if(current)return current;
 const g=generation;
 const task=(async()=>{
 const b=src.startsWith('/demo-media/')?await readLocal(src):await (async()=>{if(!/^\/api\/media\/[a-f0-9-]{36}$/i.test(src))throw Error('INVALID_INPUT');const r=await fetch(API+src,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('MEDIA_UNAVAILABLE');return r.blob()})();
 if(g!==generation||token!==(getToken()||''))throw Error('UNAUTHORIZED');
 const old=cache.get(key);if(old){old.checked=Date.now();old.used=Date.now();return old.url;}const url=URL.createObjectURL(b);cache.set(key,{url,size:b.size,checked:Date.now(),used:Date.now()});trimCache();return url;
 })().finally(()=>{if(pending.get(key)===task)pending.delete(key)});pending.set(key,task);return task;
}
export function useMedia(src?:string|null){
 const [state,setState]=useState({url:'',error:false});const [retry,setRetry]=useState(0);
 useEffect(()=>{let live=true;const key=account+':'+(getToken()||'')+':'+src;active.set(key,(active.get(key)||0)+1);setState({url:'',error:false});if(src)cachedMedia(src).then(url=>{if(live)setState({url,error:false})}).catch(()=>{if(live)setState({url:'',error:true})});return()=>{live=false;active.set(key,Math.max(0,(active.get(key)||1)-1));trimCache()}},[src,retry]);
 return {...state,retry:()=>setRetry(x=>x+1)};
}
export function AvatarPhoto({src}:{src:string}){const {url,error}=useMedia(src);const [ready,setReady]=useState(false);useEffect(()=>setReady(false),[url]);return <>{!ready&&!error&&<span className="media-skeleton avatar-photo" aria-hidden="true"/>}{url&&<img src={url} alt="" className="avatar-photo" onLoad={()=>setReady(true)} onError={()=>setReady(true)} style={{opacity:ready?1:0}}/>}</>;}
export async function mediaDimensions(file:File):Promise<{width:number;height:number}|undefined>{
 if(file.type.startsWith('image/')){try{const b=await createImageBitmap(file);const d={width:b.width,height:b.height};b.close();return d}catch{return}}
 if(file.type.startsWith('video/'))return new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file);let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);const d=v.videoWidth&&v.videoHeight?{width:v.videoWidth,height:v.videoHeight}:undefined;v.removeAttribute('src');v.load();URL.revokeObjectURL(url);resolve(d)};const timer=setTimeout(finish,5000);v.onloadedmetadata=finish;v.onerror=finish;v.preload='metadata';v.src=url;});
}

export function mediaLabel(mime:string,pt=true){return mime.startsWith('image/')?(pt?'Foto':'Photo'):mime.startsWith('video/')?(pt?'Vídeo':'Video'):mime.startsWith('audio/')?(pt?'Áudio':'Audio'):mime==='application/pdf'?'PDF':(pt?'Documento':'Document');}
export function MessageMedia({attachment,lang='pt',onOpen}:{attachment?:{id:string;name:string;mime:string;size:number;url?:string;width?:number;height?:number};lang?:string;onOpen?:()=>void}){
 const media=useMedia(attachment?.url|| (attachment?'/api/media/'+attachment.id:null));
 const [ready,setReady]=useState(false);useEffect(()=>setReady(false),[media.url]);
 if(!attachment)return null;
 const visual=/^(image|video)\//.test(attachment.mime),audio=attachment.mime.startsWith('audio/');
 const label=mediaLabel(attachment.mime,lang==='pt');
 const ratio=attachment.width&&attachment.height?attachment.width/attachment.height:4/3;
 return <div className="message-media">
 {(visual||audio)&&<div className="media-frame" style={visual?{aspectRatio:String(ratio),width:Math.min(360,attachment.width||360),maxWidth:'100%'}:{height:54}}>
 {!ready&&!media.error&&<div className="media-skeleton" role="status" aria-label={lang==='pt'?'Carregando mídia':'Loading media'}/>}
 {media.url&&(attachment.mime.startsWith('image/')?<button type="button" className="open-chat-photo" onClick={onOpen} aria-label={lang==='pt'?'Abrir foto na galeria':'Open photo gallery'}><img src={media.url} alt={label} onLoad={()=>setReady(true)} onError={()=>setReady(true)} style={{opacity:ready?1:0}}/></button>:attachment.mime.startsWith('video/')?<video controls preload="metadata" src={media.url} onLoadedData={()=>setReady(true)}/>:<ChatAudioPlayer src={media.url} lang={lang} onReady={()=>setReady(true)}/>)}
 </div>}
 {media.error?<button type="button" onClick={media.retry}>{lang==='pt'?'Tentar carregar novamente':'Retry loading'}</button>:media.url?<a href={media.url} download={attachment.name}>{label} · {(attachment.size/1024).toFixed(0)} KB ↓</a>:!visual&&!audio?<span className="media-skeleton file-skeleton" role="status" aria-label={lang==='pt'?'Carregando documento':'Loading document'}/>:null}
 </div>;
}

export function MessageText({text}:{text:string}){return <>{text.split(/(https:\/\/www\.openstreetmap\.org\/[^\s]+)/g).map((part,i)=>part.startsWith('https://www.openstreetmap.org/')?<a key={i} href={part} target="_blank" rel="noreferrer">📍 OpenStreetMap</a>:part)}</>;}
