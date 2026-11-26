/**
 * Compact photographic attachments on the device before upload.
 * This is intentionally opt-in from the gallery/camera/paste composer paths:
 * sending as "File" retains the original byte-for-byte.
 */
const SUPPORTED_PHOTOS = new Set(['image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const MIN_BYTES = 300 * 1024;
const MAX_EDGE = 2048;
const WEBP_QUALITY = 0.85;
const MIN_SAVING = 0.10;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('ABORTED');
}

export async function optimizeImageAttachment(file: File, signal?: AbortSignal): Promise<File> {
  assertNotAborted(signal);
  // PNGs (often screenshots and text) are retained without lossy re-encoding.
  // GIFs, including animated GIFs, must also remain untouched.
  if (!SUPPORTED_PHOTOS.has(file.type) || file.size < MIN_BYTES ||
      typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    bitmap = await createImageBitmap(file);
    assertNotAborted(signal);
    if (!bitmap.width || !bitmap.height) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    assertNotAborted(signal);
    bitmap.close();bitmap=undefined;
    const optimized = await new Promise<Blob | null>(resolve =>
      canvas!.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    assertNotAborted(signal);
    // WebP is not always supported by the canvas encoder (notably older browsers).
    // Keep the source whenever conversion would save too little or add bytes.
    if (!optimized || optimized.type !== 'image/webp' ||
        optimized.size >= file.size * (1 - MIN_SAVING)) return file;
    const base = (file.name.replace(/\.[^.]+$/, '') || 'foto').slice(0, 174);
    return new File([optimized], base + '.webp', {
      type: 'image/webp', lastModified: file.lastModified,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.message === 'ABORTED')) {
      throw new Error('ABORTED');
    }
    // Decoding and encoding are browser-dependent, especially for HEIC/HEIF.
    // Image optimization must never make an otherwise valid upload fail.
    return file;
  } finally {
    bitmap?.close();
    if(canvas){canvas.width=0;canvas.height=0}
  }
}

// Read JPEG dimensions without allocating a full-resolution pixel buffer.
export async function jpegDimensions(file:Blob):Promise<{width:number;height:number}|undefined>{
 const bytes=new Uint8Array(await file.slice(0,512*1024).arrayBuffer());
 if(bytes[0]!==255||bytes[1]!==216)return;
 let i=2;
 while(i+3<bytes.length){
  if(bytes[i++]!==255)return;
  while(bytes[i]===255)i++;
  const marker=bytes[i++];
  if(marker===217||marker===218)return;
  if(marker===1||(marker>=208&&marker<=215))continue;
  const length=bytes[i]*256+bytes[i+1];
  if(length<2||i+length>bytes.length)return;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){
   const height=bytes[i+3]*256+bytes[i+4],width=bytes[i+5]*256+bytes[i+6];
   if(width&&height)return {width,height};
  }
  i+=length;
 }
}
// Camera files must be bounded before a preview can decode the original.
export async function prepareCameraPhoto(file:File,signal?:AbortSignal):Promise<File>{
 assertNotAborted(signal);
 if(!file.size||file.size>50*1024*1024)throw Error('CAMERA_PHOTO_TOO_LARGE');
 if(file.type!=='image/jpeg'){
  const prepared=await optimizeImageAttachment(file,signal);
  if(prepared.size>10*1024*1024)throw Error('CAMERA_PHOTO_TOO_LARGE');
  return prepared;
 }
 const dimensions=await jpegDimensions(file);
 assertNotAborted(signal);
 if(!dimensions)throw Error('CAMERA_PHOTO_UNSUPPORTED');
 const longest=Math.max(dimensions.width,dimensions.height);
 if(longest<=1600&&file.size<=10*1024*1024)return file;
 if(typeof createImageBitmap!=='function')throw Error('CAMERA_PHOTO_UNSUPPORTED');
 let bitmap:ImageBitmap|undefined,canvas:HTMLCanvasElement|undefined;
 try{
  // A single resize axis preserves the decoder's orientation and aspect ratio.
  // Use the shorter scaled edge to bound both possible EXIF orientations.
  const resizeWidth=Math.max(1,Math.min(1600,Math.round(Math.min(dimensions.width,dimensions.height)*1600/longest)));
  bitmap=await createImageBitmap(file,{resizeWidth,resizeQuality:'medium'});
  assertNotAborted(signal);
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('CAMERA_PHOTO_UNSUPPORTED');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();bitmap=undefined;
  const blob=await new Promise<Blob|null>(resolve=>canvas!.toBlob(resolve,'image/jpeg',0.85));
  assertNotAborted(signal);
  if(!blob||blob.type!=='image/jpeg'||blob.size>10*1024*1024)throw Error('CAMERA_PHOTO_UNSUPPORTED');
  return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'photo').slice(0,174)+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
 }finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0}}
}

// Native capture has a stricter input budget than gallery imports. Reject before decoding.
export async function prepareNativeCameraPhoto(file:File,signal?:AbortSignal):Promise<File>{
 assertNotAborted(signal);
 if(!file.size||file.size>20*1024*1024||file.type!=='image/jpeg')throw Error('NATIVE_CAMERA_PHOTO_LIMIT');
 const dimensions=await jpegDimensions(file);
 assertNotAborted(signal);
 if(!dimensions||dimensions.width*dimensions.height>24_000_000)throw Error('NATIVE_CAMERA_PHOTO_LIMIT');
 return prepareCameraPhoto(file,signal);
}
