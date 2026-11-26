import {ChatAudioPlayer} from './ChatAudioPlayer';
export {ChatAudioPlayer} from './ChatAudioPlayer';
import {useEffect,useState} from 'react';
import {MapPin,ExternalLink} from 'lucide-react';
import {API,getToken} from './api';
import {mediaCacheKey,readMediaCache,writeMediaCache,cacheableMedia,MEDIA_CACHE_TTL} from './mediaCache';
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
type Cached={url:string;size:number;checked:number;used:number;fromDisk:boolean};
const cache=new Map<string,Cached>();
const pending=new Map<string,Promise<string>>();
const active=new Map<string,number>();
let account='';let generation=0;
export function setMediaAccount(next:string){if(next===account)return;account=next;generation++;for(const v of cache.values())URL.revokeObjectURL(v.url);cache.clear();pending.clear();active.clear();}
function trimCache(){let total=[...cache.values()].reduce((sum,v)=>sum+v.size,0);for(const [key,v] of [...cache].sort((a,b)=>a[1].used-b[1].used)){if(total<=64*1048576&&cache.size<=160)break;if(active.get(key))continue;cache.delete(key);URL.revokeObjectURL(v.url);total-=v.size;}}
// IndexedDB can be blocked; bound the wait and fall back to authenticated fetch.
async function storedMedia(key:string,preferAudio:boolean):Promise<Blob|null>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([readMediaCache(key).then(async b=>{
  if(!b||!cacheableMedia(b)||(preferAudio&&!b.type.startsWith('audio/')))return null;
  // Probe a tiny slice, not the full video or image. Audio retains its existing
  // workaround for browsers that fail to play a restored IndexedDB Blob.
  if(!preferAudio){await b.slice(0,1).arrayBuffer();return b;}
  const bytes=await b.arrayBuffer();
  return bytes.byteLength===b.size?new Blob([bytes],{type:b.type}):null;
 }),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1500)})]);}
 catch{return null}finally{clearTimeout(timer)}
}
export async function cachedMedia(src:string,preferAudio=false,fresh=false){
 if(src.startsWith('data:')||src.startsWith('blob:'))return src;
 const token=getToken()||'';const key=account+':'+token+':'+src;const entry=cache.get(key);
 if(!fresh&&entry&&Date.now()-entry.checked<MEDIA_CACHE_TTL){entry.used=Date.now();return entry.url;}
 const current=pending.get(key);if(current)return current;
 const g=generation,owner=account;
 const task=(async()=>{
 const diskKey=await mediaCacheKey(owner,token,src);
 if(g!==generation||token!==(getToken()||''))throw Error('UNAUTHORIZED');
 const stored=diskKey&&!fresh?await storedMedia(diskKey,preferAudio):null;
 if(g!==generation||token!==(getToken()||''))throw Error('UNAUTHORIZED');
 const b=stored??(src.startsWith('/demo-media/')?await readLocal(src):await (async()=>{if(!/^\/api\/(?:media|public-media)\/[a-f0-9-]{36}$/i.test(src))throw Error('INVALID_INPUT');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(API+src,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('MEDIA_UNAVAILABLE');const blob=await r.blob();if(!blob.size||(preferAudio&&!blob.type.startsWith('audio/')))throw Error('MEDIA_UNAVAILABLE');return blob}finally{clearTimeout(timer)}})());
 if(g!==generation||token!==(getToken()||''))throw Error('UNAUTHORIZED');
 if(!stored&&diskKey&&cacheableMedia(b))void writeMediaCache(diskKey,b);
 const old=cache.get(key);if(old&&!fresh){old.checked=Date.now();old.used=Date.now();return old.url;}const url=URL.createObjectURL(b);if(old)URL.revokeObjectURL(old.url);cache.set(key,{url,size:b.size,checked:Date.now(),used:Date.now(),fromDisk:!!stored});trimCache();return url;
 })().finally(()=>{if(pending.get(key)===task)pending.delete(key)});pending.set(key,task);return task;
}
export function useMedia(src?:string|null,preferAudio=false){
 const identity=account+':'+(getToken()||'')+':'+src;
 const initial=cache.get(identity);
 const [state,setState]=useState<{identity:string;url:string;error:boolean;cached:boolean}>({identity,url:initial?.url||'',error:false,cached:!!initial});
 const [retry,setRetry]=useState(0);
 const [slow,setSlow]=useState(false);
 useEffect(()=>{let live=true;const key=identity;const existing=cache.get(key);active.set(key,(active.get(key)||0)+1);setSlow(false);
  setState({identity,url:retry===0?existing?.url||'':'',error:false,cached:retry===0&&!!existing});
  const reveal=setTimeout(()=>{if(live)setSlow(true)},200);
  const timer=setTimeout(()=>{if(live){live=false;setState({identity,url:'',error:true,cached:false})}},25000);
  if(src)cachedMedia(src,preferAudio,retry>0).then(url=>{if(live)setState({identity,url,error:false,cached:!!existing||!!cache.get(key)?.fromDisk})}).catch(()=>{if(live)setState({identity,url:'',error:true,cached:false})}).finally(()=>{clearTimeout(timer);clearTimeout(reveal)});else{clearTimeout(timer);clearTimeout(reveal)}
  return()=>{clearTimeout(timer);clearTimeout(reveal);live=false;const count=(active.get(key)||1)-1;if(count>0)active.set(key,count);else active.delete(key);trimCache()}
 },[src,retry,preferAudio,identity]);
 const current=state.identity===identity?state:{url:initial?.url||'',error:false,cached:!!initial};
 return {...current,slow,retry:()=>setRetry(x=>x+1),attempt:retry};
}
// Track decode state by URL, not a resetting effect that can race a cached load.
export function MediaImage({url,className,cached=false,onDecodeError}:{url:string;className?:string;cached?:boolean;onDecodeError?:()=>void}){
 const [state,setState]=useState<'loading'|'ready'|'failed'>('loading');
 useEffect(()=>{if(state!=='loading')return;const timer=setTimeout(()=>{setState('failed');onDecodeError?.()},12000);return()=>clearTimeout(timer)},[state]);
 if(state==='failed')return null;
 return <>{state==='loading'&&!cached&&<span className="media-skeleton avatar-photo" aria-hidden="true"/>}<img src={url} alt="" className={className} ref={node=>{if(node?.complete)setState(node.naturalWidth?'ready':'failed')}} onLoad={()=>setState('ready')} onError={()=>{setState('failed');onDecodeError?.()}} style={{opacity:state==='ready'?1:0}}/></>;
}
export function AvatarPhoto({src}:{src:string}){const {url,error,cached,slow,retry,attempt}=useMedia(src);return url?<MediaImage key={url} url={url} className="avatar-photo" cached={cached} onDecodeError={cached&&attempt===0?retry:undefined}/>:!error&&slow?<span className="media-skeleton avatar-photo" aria-hidden="true"/>:null;}
export async function mediaDimensions(file:File):Promise<{width:number;height:number}|undefined>{
 if(file.type.startsWith('image/')){try{const b=await createImageBitmap(file);const d={width:b.width,height:b.height};b.close();return d}catch{return}}
 if(file.type.startsWith('video/'))return new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file);let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);const d=v.videoWidth&&v.videoHeight?{width:v.videoWidth,height:v.videoHeight}:undefined;v.removeAttribute('src');v.load();URL.revokeObjectURL(url);resolve(d)};const timer=setTimeout(finish,5000);v.onloadedmetadata=finish;v.onerror=finish;v.preload='metadata';v.src=url;});
}

export function mediaLabel(mime:string,pt=true){return mime.startsWith('image/')?(pt?'Foto':'Photo'):mime.startsWith('video/')?(pt?'Vídeo':'Video'):mime.startsWith('audio/')?(pt?'Áudio':'Audio'):mime==='application/pdf'?'PDF':(pt?'Documento':'Document');}
export function MessageMedia({attachment,lang='pt',onOpen}:{attachment?:{id:string;name:string;mime:string;size:number;url?:string;width?:number;height?:number};lang?:string;onOpen?:()=>void}){
 const media=useMedia(attachment?.url|| (attachment?'/api/media/'+attachment.id:null),!!attachment?.mime.startsWith('audio/'));
 const [ready,setReady]=useState(false);useEffect(()=>setReady(false),[media.url]);
 if(!attachment)return null;
 const visual=/^(image|video)\//.test(attachment.mime),audio=attachment.mime.startsWith('audio/');
 const label=mediaLabel(attachment.mime,lang==='pt');
 const ratio=attachment.width&&attachment.height?attachment.width/attachment.height:4/3;
 return <div className={audio?"message-media message-audio":"message-media"}>
 {(visual||audio)&&<div className="media-frame" style={visual?{aspectRatio:String(ratio),width:Math.min(360,attachment.width||360),maxWidth:'100%'}:{width:280,height:54}}>
 {!(audio?media.url:ready)&&!media.error&&!media.cached&&<div className="media-skeleton" role="status" aria-label={lang==='pt'?'Carregando mídia':'Loading media'}/>}
 {media.url&&(attachment.mime.startsWith('image/')?<button type="button" className="open-chat-photo" onClick={onOpen} aria-label={lang==='pt'?'Abrir foto na galeria':'Open photo gallery'}><img src={media.url} alt={label} onLoad={()=>setReady(true)} onError={()=>{if(media.cached&&media.attempt===0)media.retry();else setReady(true)}} style={{opacity:ready?1:0}}/></button>:attachment.mime.startsWith('video/')?<video controls preload="metadata" src={media.url} onLoadedData={()=>setReady(true)} onError={()=>{if(media.cached&&media.attempt===0)media.retry();else setReady(true)}}/>:<ChatAudioPlayer key={media.url} src={media.url} lang={lang} onRetry={media.retry}/>)}
 </div>}
 {media.error?<button type="button" onClick={media.retry}>{lang==='pt'?'Tentar carregar novamente':'Retry loading'}</button>:media.url?(!visual&&!audio?<a className="document-open" href={media.url} target="_blank" rel="noreferrer">{label}</a>:null):!visual&&!audio?<span className="media-skeleton file-skeleton" role="status" aria-label={lang==='pt'?'Carregando documento':'Loading document'}/>:null}
 </div>;
}

import {mapCoordinates} from "./mapCoordinates";
export {mapCoordinates} from "./mapCoordinates";
function LocationCard({lat,lon,lang}:{lat:number;lon:number;lang:string}){
 const pt=lang==='pt',coords=`${lat},${lon}`;
 const href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(coords);
 const preview='https://www.google.com/maps?q='+encodeURIComponent(coords)+'&z=15&output=embed';
 return <a className="location-card" href={href} target="_blank" rel="noopener noreferrer" aria-label={pt?'Abrir localização no Google Maps':'Open location in Google Maps'}>
  <span className="location-preview"><span className="location-fallback"><MapPin size={32}/></span><iframe src={preview} title={pt?'Prévia do mapa':'Map preview'} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} aria-hidden="true" sandbox="allow-scripts allow-same-origin"/></span>
  <span className="location-card-label"><MapPin size={17}/><span>{pt?'Localização':'Location'}<small>Google Maps</small></span><ExternalLink size={15}/></span>
 </a>;
}
export function MessageText({text,lang='pt'}:{text:string;lang?:string}){return <>{text.split(/(https?:\/\/[^\s]+)/g).map((part,i)=>{if(!/^https?:\/\//.test(part))return part;const coords=mapCoordinates(part);return coords?<LocationCard key={i} {...coords} lang={lang}/>:<a key={i} href={part} target="_blank" rel="noopener noreferrer" className="message-link">{part}</a>})}</>;}
