export type InstallPrompt = Event & {prompt():Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
const DAY="peakboo-install-invite-day",INSTALLED="peakboo-pwa-installed";
let promptEvent:InstallPrompt|null=null,installedHere=false,memoryDay="";
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(fn=>fn());
function read(key:string){try{return localStorage.getItem(key)||""}catch{return ""}}
function write(key:string,value:string){try{localStorage.setItem(key,value)}catch{}}
export function localDay(now=new Date()){return [now.getFullYear(),now.getMonth()+1,now.getDate()].join("-")}
export function shouldInviteInstall(installed:boolean,lastDay:string,today:string,installable:boolean){return !installed&&lastDay!==today&&installable}
export function markInstallInvite(){memoryDay=localDay();write(DAY,memoryDay)}
// Installation remembered in storage is not proof that this window was launched as an app.
export function isPwaWindow(){
 return window.matchMedia?.("(display-mode: standalone)").matches===true||window.matchMedia?.("(display-mode: fullscreen)").matches===true||(navigator as Navigator&{standalone?:boolean}).standalone===true;
}
export function installedPwa(){
 return installedHere||isPwaWindow()||read(INSTALLED)==="1";
}
export function installationState(){return {installed:installedPwa(),native:!!promptEvent,lastDay:read(DAY)||memoryDay}}
export function watchInstallation(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
export function platform(){const ua=navigator.userAgent;return /Android/i.test(ua)?"android":/iPad|iPhone|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)?"ios":"desktop"}
if(typeof window!=="undefined"){
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();promptEvent=event as InstallPrompt;installedHere=false;write(INSTALLED,"0");notify()});
 window.addEventListener("appinstalled",()=>{installedHere=true;promptEvent=null;write(INSTALLED,"1");notify()});
 if(window.matchMedia?.("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone)write(INSTALLED,"1");
 window.addEventListener("storage",e=>{if(e.key===DAY||e.key===INSTALLED)notify()});
}
export async function installNative(){
 const event=promptEvent;if(!event)return "unavailable";
 promptEvent=null;notify();
 await event.prompt();
 const {outcome}=await event.userChoice;
 if(outcome==="accepted"){installedHere=true;write(INSTALLED,"1");notify()}
 return outcome;
}
