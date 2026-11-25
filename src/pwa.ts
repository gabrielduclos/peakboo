import {request} from "./api";
import {isPwaWindow} from "./pwaInstall";
const supported=()=>typeof navigator!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
export const canPush=()=>supported()&&isPwaWindow();
let registration:Promise<ServiceWorkerRegistration>|null=null;
export function registerPwa(){
 if(!("serviceWorker" in navigator))return null;
 if(!registration)registration=navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).catch(e=>{registration=null;throw e});
 return registration;
}
export async function pushRegistration(){
 const pending=registerPwa();if(!pending)throw Error("PUSH_UNAVAILABLE");await pending;
 return navigator.serviceWorker.ready;
}
const OWNER="peakboo-push-owner";
const consentKey=(userId:string)=>"peakboo-push-consent:"+userId;
export function pushConsent(userId:string):{preview:boolean}|null{try{return JSON.parse(localStorage.getItem(consentKey(userId))||"null")}catch{return null}}
function saveConsent(userId:string,value:{preview:boolean}|null){try{if(value)localStorage.setItem(consentKey(userId),JSON.stringify(value));else localStorage.removeItem(consentKey(userId))}catch{}}
export function decodePublicKey(key:string):Uint8Array<ArrayBuffer>{const raw=atob(key.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-key.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function saveSubscription(sub:PushSubscription,userId:string,lang:string,preview:boolean){
 const json=sub.toJSON();await request("/api/push/subscriptions","POST",{endpoint:json.endpoint,keys:json.keys,locale:lang==="pt"?"pt":"en",preview});saveConsent(userId,{preview});try{localStorage.setItem(OWNER,userId)}catch{}
}
export async function enablePush(userId:string,lang:string,publicKey:string,preview:boolean){
 if(!canPush())throw Error("PUSH_UNAVAILABLE");
 // Browser permission must be requested in the direct click handler (especially iOS).
 const permission=await Notification.requestPermission();if(permission!=="granted")throw Error("PUSH_DENIED");
 const reg=await pushRegistration();let sub=await reg.pushManager.getSubscription();
 const key=decodePublicKey(publicKey);
 if(sub?.options.applicationServerKey){const old=new Uint8Array(sub.options.applicationServerKey);if(old.length!==key.length||old.some((v,i)=>v!==key[i])){await sub.unsubscribe();sub=null}}
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{await saveSubscription(sub,userId,lang,preview)}catch(e){await sub.unsubscribe().catch(()=>false);throw e}
}
export async function syncPush(userId:string,lang:string):Promise<boolean>{
 if(!canPush())return false;
 const consent=pushConsent(userId);let owner:string|null=null;try{owner=localStorage.getItem(OWNER)}catch{}
 if(owner&&owner!==userId){const reg=await pushRegistration(),old=await reg.pushManager.getSubscription();if(old)await old.unsubscribe();saveConsent(owner,null);try{localStorage.removeItem(OWNER)}catch{};return false}
 if(!consent||Notification.permission!=="granted")return false;
 const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(!sub)return false;
 const status=await request("/api/push/status","POST",{endpoint:sub.endpoint});
 if(!status.active||status.locale!==lang||status.preview!==consent.preview)await saveSubscription(sub,userId,lang,consent.preview);
 return true;
}
export async function disablePush(userId:string){
 saveConsent(userId,null);try{if(localStorage.getItem(OWNER)===userId)localStorage.removeItem(OWNER)}catch{}
 if(!supported())return;
 const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();
 if(!sub)return;
 let error:unknown=null;
 try{await request("/api/push/subscriptions","DELETE",{endpoint:sub.endpoint})}catch(e){error=e}
 await sub.unsubscribe();if(error)throw error;
}
export async function updatePreview(userId:string,lang:string,preview:boolean){
 const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(!sub)throw Error("PUSH_UNAVAILABLE");
 await saveSubscription(sub,userId,lang,preview);
}
