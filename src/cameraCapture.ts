export const PHOTO_FLASH_SETTLE_MS=800;
export const VIDEO_MAX_SECONDS=90;
export const VIDEO_BITRATE=1_200_000;
export const VIDEO_MAX_BYTES=24*1024*1024;
export const VIDEO_STOP_BYTES=20*1024*1024;

export function cameraConstraints(mode:'image'|'video',facing:'user'|'environment'):MediaTrackConstraints{
 return mode==='video'?{facingMode:{ideal:facing},width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:24,max:24}}:
 {facingMode:{ideal:facing},width:{ideal:1280,max:1600},height:{ideal:960,max:1600},frameRate:{ideal:24,max:30}};
}
type TorchCapabilities=MediaTrackCapabilities&{torch?:boolean|boolean[]};
type TorchSettings=MediaTrackSettings&{torch?:boolean};
type TorchConstraint=MediaTrackConstraintSet&{torch:boolean};
export function canAttemptTorch(track:MediaStreamTrack,facing:'user'|'environment'){
 if(facing==='user'||typeof track.applyConstraints!=='function')return false;
 try{const value=(track.getCapabilities?.() as TorchCapabilities|undefined)?.torch;
 if(Array.isArray(value))return value.includes(true);
 if(typeof value==='boolean')return value;
 // Some Android browsers omit torch capabilities until the first constraint.
 return true;}catch{return true}
}
export async function setCameraTorch(track:MediaStreamTrack,on:boolean):Promise<boolean>{
 if(track.readyState!=='live')return false;
 // applyConstraints replaces existing constraints: retain resolution, frame rate and lens.
 const previous=(track.getConstraints?.()??{}) as MediaTrackConstraints&{torch?:boolean};
 const {advanced=[],torch:_oldTorch,...base}=previous;
 const retained=advanced.map(c=>{const {torch:_torch,...rest}=c as MediaTrackConstraintSet&{torch?:boolean};return rest}).filter(c=>Object.keys(c).length>0);
 const direct={...base,advanced:retained,torch:on} as MediaTrackConstraints;
 const nested={...base,advanced:[...retained,{torch:on} as TorchConstraint]};
 const combined={...direct,advanced:nested.advanced};
 let acceptedWithoutSettings=false;
 let reportedMismatch=false;
 for(const constraints of [combined,nested,direct]){
  if(track.readyState!=='live')return false;
  try{
   await track.applyConstraints(constraints);
   // Allow an asynchronous camera driver to update before checking settings.
   await new Promise<void>(resolve=>setTimeout(resolve,120));
   if(track.readyState!=='live')return false;
   const actual=(track.getSettings?.() as TorchSettings|undefined)?.torch;
   if(actual===on)return true;
   if(actual===undefined)acceptedWithoutSettings=true;
   else reportedMismatch=true;
  }catch{/* A resolved promise without confirmation is not enough to skip alternatives. */}
 }
 // Some browsers expose no torch setting. Treat accepted commands as best effort,
 // but never treat an explicitly contradictory setting as confirmation.
 return acceptedWithoutSettings&&!reportedMismatch;
}
export function recordingMime(supports:(type:string)=>boolean){
 return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(supports);
}
