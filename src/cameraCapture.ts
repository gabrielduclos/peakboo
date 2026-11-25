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
 for(const constraints of [{advanced:[{torch:on} as TorchConstraint]},{torch:on} as MediaTrackConstraints]){
  try{await track.applyConstraints(constraints);
   const actual=(track.getSettings?.() as TorchSettings|undefined)?.torch;
   if(actual===on||actual===undefined)return true;
  }catch{/* Try the alternate constraint syntax. */}
 }
 return false;
}
export function recordingMime(supports:(type:string)=>boolean){
 return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(supports);
}
