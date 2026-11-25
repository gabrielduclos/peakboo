import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarPlus, ListChecks, SwitchCamera, Zap, ZapOff, Camera, FileText, Images, MapPin, Mic, Pause, Pencil, Play, Plus, Send, Smile, Video, X } from 'lucide-react';
import { attachmentLabel } from './chatAttachmentLabels';
import { createPortal } from 'react-dom';
import { ChatAudioPlayer,mediaLabel } from './Media';
import { ChatImageEditor } from './ChatImageEditor';
import { cn } from './components';
import { optimizeVideoAttachment } from './videoCompression';
import { optimizeImageAttachment, prepareCameraPhoto } from './imageCompression';

const EMOJI_GROUPS = [
  { pt: 'Expressões', en: 'Expressions', symbols: ['😀','😃','😁','😂','🤣','😊','😍','🥰','😘','😎','🥹','😢','😭','😡','🤔','😴','🤩','😮'] },
  { pt: 'Gestos', en: 'Gestures', symbols: ['👍','👎','👏','🙌','🙏','👋','👌','✌️','🤝','💪','🫶','👀'] },
  { pt: 'Corações e símbolos', en: 'Hearts and symbols', symbols: ['❤️','🩷','💜','💙','💚','💔','🔥','✨','🎉','✅','⭐','🎮'] },
] as const;

const ATTACHMENTS = [
  { icon: Images, pt: 'Galeria', en: 'Gallery' },
  { icon: Camera, pt: 'Câmera', en: 'Camera' },
  { icon: FileText, pt: 'Arquivo', en: 'File' },
  { icon: MapPin, pt: 'Localização', en: 'Location' },
] as const;


/** Only the downscaled JPEG is retained; the original camera frame is never exported. */
function PhotoCameraModal({pt,onClose,onAccept}:{pt:boolean;onClose:()=>void;onAccept:(file:File)=>void}){
  const video=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null);
  const active=useRef(true);
  const captureBusy=useRef(false);
  const [facing,setFacing]=useState<'user'|'environment'>('environment');
  const [generation,restart]=useState(0);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [hasTorch,setHasTorch]=useState(false);
  const [torch,setTorch]=useState(false);
  const [torchBusy,setTorchBusy]=useState(false);
  const [photo,setPhoto]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const stop=()=>{
    const current=stream.current;
    stream.current=null;
    current?.getTracks().forEach(track=>track.stop());
    if(video.current)video.current.srcObject=null;
  };
  useEffect(()=>{active.current=true;return()=>{active.current=false;stop();};},[]);
  useEffect(()=>{
    if(!photo){setPreview('');return;}
    const url=URL.createObjectURL(photo);
    setPreview(url);
    return()=>URL.revokeObjectURL(url);
  },[photo]);
  useEffect(()=>{
    if(photo)return;
    let cancelled=false;
    setReady(false);setError('');setHasTorch(false);setTorch(false);setTorchBusy(false);
    const open=async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
        const constraints:MediaTrackConstraints={facingMode:{ideal:facing},width:{ideal:1280,max:1600},height:{ideal:960,max:1600},frameRate:{ideal:24,max:30}};
        let next:MediaStream;
        try{next=await navigator.mediaDevices.getUserMedia({audio:false,video:constraints});}
        catch(e){if(!(e instanceof DOMException)||e.name!=='OverconstrainedError')throw e;next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}}});}
        if(cancelled||!active.current){next.getTracks().forEach(t=>t.stop());return;}
        stream.current=next;
        const track=next.getVideoTracks()[0];
        const caps=track?.getCapabilities?.() as (MediaTrackCapabilities & {torch?:boolean})|undefined;
        setHasTorch(caps?.torch===true);
        if(video.current){video.current.srcObject=next;await video.current.play();}
        if(!cancelled&&active.current)setReady(true);
      }catch{
        if(!cancelled&&active.current){stop();setError(pt?'Não foi possível abrir a câmera. Verifique a permissão ou tente novamente.':'Could not open the camera. Check permissions or retry.');}
      }
    };
    void open();
    return()=>{cancelled=true;stop();};
  },[facing,generation,photo,pt]);
  async function toggleTorch(){
    const track=stream.current?.getVideoTracks()[0];
    if(!track||!hasTorch||torchBusy)return;
    setTorchBusy(true);
    try{
      await track.applyConstraints({advanced:[{torch:!torch} as MediaTrackConstraintSet]});
      if(active.current&&stream.current?.getVideoTracks()[0]===track)setTorch(!torch);
    }catch{if(active.current){setHasTorch(false);setTorch(false);}}
    finally{if(active.current)setTorchBusy(false);}
  }
  async function capture(){
    const frame=video.current;
    if(!ready||!frame?.videoWidth||!frame.videoHeight||captureBusy.current)return;
    captureBusy.current=true;setBusy(true);setError('');
    const canvas=document.createElement('canvas');
    try{
      const ratio=Math.min(1,1600/Math.max(frame.videoWidth,frame.videoHeight));
      canvas.width=Math.max(1,Math.round(frame.videoWidth*ratio));
      canvas.height=Math.max(1,Math.round(frame.videoHeight*ratio));
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw Error('canvas');
      ctx.drawImage(frame,0,0,canvas.width,canvas.height);
      stop();setReady(false);setTorch(false);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
      if(!blob?.size||blob.type!=='image/jpeg'||blob.size>10*1024*1024)throw Error('encode');
      if(active.current)setPhoto(new File([blob],'foto-'+Date.now()+'.jpg',{type:'image/jpeg'}));
    }catch{if(active.current){setError(pt?'Não foi possível capturar a foto. Tente novamente.':'Could not capture the photo. Retry.');setReady(false);stop();}}
    finally{canvas.width=0;canvas.height=0;captureBusy.current=false;if(active.current)setBusy(false);}
  }
  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/80"/>
      <Dialog.Content className="fixed inset-0 z-[101] m-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-black text-white sm:h-[min(90dvh,800px)] sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between p-4">
          <Dialog.Title className="text-base font-semibold">{pt?'Câmera':'Camera'}</Dialog.Title>
          <Dialog.Description className="sr-only">{pt?'Capture e confirme uma foto':'Capture and confirm a photo'}</Dialog.Description>
          <Dialog.Close asChild><button type="button" className="grid size-11 place-items-center rounded-full bg-white/10" aria-label={pt?'Fechar câmera':'Close camera'}><X className="size-6"/></button></Dialog.Close>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {photo? <img src={preview||undefined} alt={pt?'Foto capturada':'Captured photo'} className="max-h-full max-w-full object-contain"/>:
            <video ref={video} autoPlay muted playsInline className={cn('h-full w-full object-contain',facing==='user'&&'-scale-x-100')} onLoadedMetadata={()=>{if(stream.current)setReady(true);}}/>}
          {(!ready&&!photo&&!error)&&<div role="status" className="absolute inset-0 grid place-items-center bg-black/30">{busy?(pt?'Preparando foto…':'Preparing photo…'):(pt?'Abrindo câmera…':'Opening camera…')}</div>}
          {error&&<div role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-black/80 p-3 text-center">{error}<button type="button" className="mt-2 block w-full underline" onClick={()=>restart(v=>v+1)}>{pt?'Tentar novamente':'Retry'}</button></div>}
        </div>
        <div className="flex shrink-0 items-center justify-around gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {photo?<><button type="button" className="min-h-12 rounded-lg bg-white/10 px-4" onClick={()=>{setPhoto(null);restart(v=>v+1);}}>{pt?'Refazer':'Retake'}</button>
            <button type="button" className="min-h-12 rounded-lg bg-white px-4 font-semibold text-black" onClick={()=>onAccept(photo)}>{pt?'Usar foto':'Use photo'}</button></>:
            <><button type="button" disabled={!ready||busy||torchBusy||!hasTorch} aria-pressed={torch} title={hasTorch?(pt?'Flash':'Flash'):(pt?'Flash indisponível':'Flash unavailable')} aria-label={torch?(pt?'Desligar flash':'Turn flash off'):(pt?'Ligar flash':'Turn flash on')} onClick={()=>void toggleTorch()} className="grid size-12 place-items-center rounded-full bg-white/10 disabled:opacity-30">{torch?<Zap className="size-6"/>:<ZapOff className="size-6"/>}</button>
            <button type="button" disabled={!ready||busy||torchBusy} aria-label={pt?'Tirar foto':'Take photo'} onClick={()=>void capture()} className="grid size-[72px] place-items-center rounded-full border-4 border-white disabled:opacity-30"><span className="size-[54px] rounded-full bg-white"/></button>
            <button type="button" disabled={busy||torchBusy} aria-label={pt?'Alternar câmera':'Switch camera'} onClick={()=>setFacing(v=>v==='environment'?'user':'environment')} className="grid size-12 place-items-center rounded-full bg-white/10 disabled:opacity-30"><SwitchCamera className="size-6"/></button></>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function LiveMessageComposer({ value, onChange, onSelectionChange, serializeValue, onSubmit, onAttach, onShareLocation, sending, locale, textareaRef, editing = false, onGif, gifOpen = false, allowOffice = false, onCreateEvent, onCreateList }: {
  value: string; onChange: (text: string) => void;
  onSelectionChange?: (text:string,start:number,end:number)=>void;
  /** Channel mentions show names in textarea but send canonical @handles. */
  serializeValue?: (text:string)=>string;
  onSubmit: () => void;
  onAttach: (file: File, caption: string) => Promise<void>;
  onShareLocation: (latitude:number,longitude:number,caption:string) => Promise<void>;
  sending: boolean; locale: string; textareaRef: RefObject<HTMLTextAreaElement | null>; editing?: boolean;
  onGif?:()=>void;gifOpen?:boolean;allowOffice?:boolean;onCreateEvent?:()=>void;onCreateList?:()=>void;
}) {
  const pt = locale === 'pt-BR';
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiCaret=useRef<{text:string;position:number}|null>(null);
  const controls = useRef<HTMLFormElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraKindRef = useRef<'image' | 'video'>('image');
  const [cameraOptions,setCameraOptions] = useState(false);
  const [photoCameraOpen,setPhotoCameraOpen]=useState(false);
  const sendingPhotosRef=useRef(false);
  const [sendingPhotos,setSendingPhotos]=useState(false);
  const [pending,setPending] = useState<File | null>(null);
  const [pendingUrl,setPendingUrl] = useState<string | null>(null);
  const localUrl = useRef<string | null>(null);
  const [pendingPhotos,setPendingPhotos] = useState<File[]>([]);
  const [photoUrls,setPhotoUrls] = useState<string[]>([]);
  const photoLocalUrls = useRef<string[]>([]);
  const [editingPhotoIndex,setEditingPhotoIndex] = useState<number | null>(null);
  const [editorOpen,setEditorOpen] = useState(false);
  const [pendingLocation,setPendingLocation] = useState<{latitude:number;longitude:number}|null>(null);
  const [locating,setLocating] = useState(false);
  const [recording,setRecording] = useState<'idle'|'recording'|'paused'>('idle');
  const [recordSeconds,setRecordSeconds] = useState(0);
  const [error,setError] = useState('');
  const [optimizing,setOptimizing] = useState(false);
  const [optimizationProgress,setOptimizationProgress] = useState(0);
  const [optimizationKind,setOptimizationKind] = useState<'image'|'video'>('video');
  const [optimizingFile,setOptimizingFile] = useState<{name:string;size:number}|null>(null);
  const [videoNotice,setVideoNotice] = useState('');
  const optimizationController=useRef<AbortController|null>(null);
  const optimizingRef=useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const discardRecording = useRef(false);
  const voiceBusy=useRef(false);
  const [voiceProcessing,setVoiceProcessing]=useState(false);
  const finishRequested=useRef(false);
  const [pausedAudio,setPausedAudio]=useState<string|null>(null);
  const pausedAudioRef=useRef<string|null>(null);
  function clearPausedAudio(){
    if(pausedAudioRef.current)URL.revokeObjectURL(pausedAudioRef.current);
    pausedAudioRef.current=null;setPausedAudio(null);
  }
  const mounted = useRef(true);
  const canSend = (!!value.trim() || !!pending || pendingPhotos.length>0 || !!pendingLocation) && !sending && !sendingPhotos && !locating && !optimizing && recording==='idle' && !voiceProcessing;
  const maxHeight = 208;
  useEffect(()=>{
    mounted.current = true;
    return ()=>{
      mounted.current = false;
      optimizationController.current?.abort();
      if(recorder.current && recorder.current.state!=='inactive') { recorder.current.onstop=null; recorder.current.stop(); }
      audioStream.current?.getTracks().forEach(track=>track.stop());
      if(pausedAudioRef.current)URL.revokeObjectURL(pausedAudioRef.current);
      if(localUrl.current) URL.revokeObjectURL(localUrl.current);
      photoLocalUrls.current.forEach(url=>URL.revokeObjectURL(url));
    };
  },[]);
  useEffect(()=>{
    if(recording==='idle')return;
    const interval=window.setInterval(()=>{ if(recorder.current?.state==='recording')setRecordSeconds(s=>s+1); },1000);
    return ()=>window.clearInterval(interval);
  },[recording]);

  // Screen Wake Lock is released as soon as a voice note ends or is discarded.
  useEffect(()=>{
    if(recording==='idle'||!('wakeLock' in navigator))return;
    let stopped=false,requesting=false;
    let lock:WakeLockSentinel|null=null;
    const acquire=async()=>{
      if(stopped||requesting||lock||document.visibilityState!=='visible')return;
      requesting=true;
      try{
        const next=await navigator.wakeLock.request('screen');
        if(stopped){void next.release().catch(()=>{});return;}
        lock=next;
        next.addEventListener('release',()=>{if(lock===next)lock=null;});
      }catch{
        // Browsers and the OS may refuse wake lock, e.g. in low-power mode.
      }finally{requesting=false;}
    };
    const resume=()=>{if(document.visibilityState==='visible')void acquire();};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    void acquire();
    return ()=>{
      stopped=true;
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('focus',resume);
      const current=lock;lock=null;
      if(current)void current.release().catch(()=>{});
    };
  },[recording==='idle']);

  function clearPending() {
    if(localUrl.current)URL.revokeObjectURL(localUrl.current);
    localUrl.current=null;
    photoLocalUrls.current.forEach(url=>URL.revokeObjectURL(url));
    photoLocalUrls.current=[];
    setPending(null); setPendingUrl(null); setPendingPhotos([]); setPhotoUrls([]);
    setEditingPhotoIndex(null); setEditorOpen(false);setVideoNotice('');
  }
  function stagePhotos(files:File[]) {
    if(editing || optimizingRef.current || sendingPhotosRef.current || !files.length)return;
    const next=[...(pending?.type.startsWith('image/')?[pending]:[]),...pendingPhotos,...files];
    if(next.length>10){setError(pt?'Selecione no máximo 10 fotos por envio.':'Select up to 10 photos per batch.');return;}
    const valid=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']);
    if(next.some(file=>!valid.has(file.type) || !file.size || file.size>10*1024*1024 ||
      !file.name || file.name.length>180 || /[\\/\r\n\u0000-\u001f]/.test(file.name))){
      setError(pt?'Selecione fotos válidas de até 10 MB cada.':'Select valid photos up to 10 MB each.');return;
    }
    clearPending();
    const urls=next.map(file=>URL.createObjectURL(file));
    photoLocalUrls.current=urls;
    setPendingPhotos(next);setPhotoUrls(urls);
    setPendingLocation(null);setError('');setAttachmentsOpen(false);
  }
  function removePhoto(index:number) {
    if(sendingPhotosRef.current)return;
    const remaining=pendingPhotos.filter((_,i)=>i!==index);
    const urls=photoUrls.filter((_,i)=>i!==index);
    URL.revokeObjectURL(photoUrls[index]);
    photoLocalUrls.current=urls;setPendingPhotos(remaining);setPhotoUrls(urls);
    setEditorOpen(false);setEditingPhotoIndex(null);
  }
  function saveEditedPhoto(blob:Blob) {
    if(editingPhotoIndex===null || !pendingPhotos[editingPhotoIndex]||sendingPhotosRef.current)return;
    if(!blob.size||blob.size>10*1024*1024){setError(pt?'A foto editada deve ter até 10 MB.':'The edited photo must be up to 10 MB.');return;}
    const source=pendingPhotos[editingPhotoIndex];
    const file=new File([blob],source.name.replace(/\.[^.]+$/,'').slice(0,168)+'-editada.png',{type:'image/png'});
    const next=URL.createObjectURL(file),index=editingPhotoIndex;
    URL.revokeObjectURL(photoUrls[index]);
    setPendingPhotos(old=>old.map((item,i)=>i===index?file:item));
    const urls=photoUrls.map((url,i)=>i===index?next:url);
    photoLocalUrls.current=urls;setPhotoUrls(urls);
    setEditorOpen(false);setEditingPhotoIndex(null);
  }
  async function stageCameraPhoto(file:File) {
    if(optimizingRef.current||editing)return;
    const controller=new AbortController();
    optimizationController.current=controller;optimizingRef.current=true;
    setOptimizing(true);setOptimizationKind('image');setOptimizationProgress(0);
    setOptimizingFile({name:file.name,size:file.size});setError('');
    try{
      const prepared=await prepareCameraPhoto(file,controller.signal);
      if(controller.signal.aborted||!mounted.current)return;
      optimizingRef.current=false;
      stagePhotos([prepared]);
    }catch{
      if(mounted.current&&!controller.signal.aborted)setError(pt?'Não foi possível preparar a foto da câmera. Tente uma resolução menor ou use a galeria.':'Could not prepare the camera photo. Try a lower resolution or use Gallery.');
    }finally{
      if(optimizationController.current===controller)optimizationController.current=null;
      optimizingRef.current=false;
      if(mounted.current){setOptimizing(false);setOptimizingFile(null)}
    }
  }
  function stageFile(file:File) {
    setPendingLocation(null);
    const mime=file.type || 'application/octet-stream';
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip','application/octet-stream',
      'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
    if(!file.size || file.size>(mime.startsWith('video/')?30:10)*1024*1024){setError(mime.startsWith('video/')?(pt?'O vídeo deve ter até 30 MB.':'Maximum video size is 30 MB.'):(pt?'O arquivo deve ter até 10 MB.':'Maximum file size is 10 MB.'));return;}
    if(allowOffice)['application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'].forEach(type=>allowed.add(type));
    if(!allowed.has(mime)){setError(pt?'Formato de arquivo não suportado.':'Unsupported file format.');return;}
    if(!file.name || file.name.length>180 || /[\\/\r\n\u0000-\u001f]/.test(file.name)){setError(pt?'Nome do arquivo inválido.':'Invalid filename.');return;}
    clearPending();
    const url=URL.createObjectURL(file);
    localUrl.current=url;setPending(file);setPendingUrl(url);setError('');setAttachmentsOpen(false);
  }
  async function stageVideo(file:File){
    if(optimizingRef.current||editing)return;
    if(!file.size||file.size>300*1024*1024||!['video/mp4','video/webm','video/quicktime'].includes(file.type)){
      setError(pt?'Escolha um vídeo MP4, WebM ou MOV de até 300 MB para compactar.':
        'Choose an MP4, WebM or MOV video up to 300 MB for compression.');return;
    }
    const controller=new AbortController();
    optimizationController.current=controller;
    optimizingRef.current=true;setOptimizing(true);setOptimizationKind('video');setOptimizationProgress(0);
    setOptimizingFile({name:file.name,size:file.size});
    setVideoNotice('');setError('');
    try{
      const result=await optimizeVideoAttachment(file,controller.signal,percent=>{
        if(mounted.current)setOptimizationProgress(percent);
      });
      if(controller.signal.aborted||!mounted.current)return;
      if(result.file.size>30*1024*1024){
        setError(pt?'Não foi possível reduzir o vídeo para até 30 MB neste navegador.':
          'This browser could not reduce the video to 30 MB or less.');return;
      }
      stageFile(result.file);
      setVideoNotice(result.compressed
        ?(pt?'Vídeo compactado: ':'Video compressed: ')+(file.size/1048576).toFixed(1)+' MB → '+(result.file.size/1048576).toFixed(1)+' MB'
        :(pt?'Vídeo já pequeno ou sem compactação disponível; original preservado.':
          'Video already small or compression unavailable; original preserved.'));
    }catch(error){
      if(!mounted.current)return;
      if(error instanceof Error&&error.message==='ABORTED')
        setVideoNotice(pt?'Compactação cancelada. Nenhum vídeo foi enviado.':'Compression cancelled. No video was sent.');
      else setError(pt?'Falha ao preparar o vídeo.':'Could not prepare the video.');
    }finally{
      if(optimizationController.current===controller)optimizationController.current=null;
      optimizingRef.current=false;
      if(mounted.current){setOptimizing(false);setOptimizingFile(null);}
    }
  }
  function selectGallery(files:File[]){
    if(!files.length||optimizingRef.current)return;
    const hasVideo=files.some(file=>file.type.startsWith('video/'));
    if(!hasVideo){void prepareGalleryPhotos(files);return;}
    if(files.length!==1){
      setError(pt?'Selecione apenas um vídeo por vez na galeria. Fotos podem ser enviadas em lote.':
        'Select one video at a time from Gallery. Photos can be sent in batches.');
      return;
    }
    void stageVideo(files[0]);
  }

  // Process gallery photos serially before any preview URLs are created.
  async function prepareGalleryPhotos(files:File[]){
    if(editing||optimizingRef.current||sendingPhotosRef.current)return;
    if(files.length+pendingPhotos.length+(pending?.type.startsWith('image/')?1:0)>10){setError(pt?'Selecione no máximo 10 fotos por envio.':'Select up to 10 photos per batch.');return;}
    const controller=new AbortController();
    optimizationController.current=controller;optimizingRef.current=true;
    setOptimizing(true);setOptimizationKind('image');setOptimizationProgress(0);setError('');
    try{
      const prepared:File[]=[];
      for(const file of files){
        if(controller.signal.aborted||!mounted.current)return;
        setOptimizingFile({name:file.name,size:file.size});
        const result=file.type==='image/jpeg'?await prepareCameraPhoto(file,controller.signal):await optimizeImageAttachment(file,controller.signal);
        if(controller.signal.aborted||!mounted.current)return;
        prepared.push(result);
        setOptimizationProgress(Math.round(prepared.length/files.length*100));
      }
      optimizingRef.current=false;stagePhotos(prepared);
    }catch{
      if(mounted.current&&!controller.signal.aborted)setError(pt?'Não foi possível preparar as fotos da galeria.':'Could not prepare gallery photos.');
    }finally{
      if(optimizationController.current===controller)optimizationController.current=null;
      optimizingRef.current=false;
      if(mounted.current){setOptimizing(false);setOptimizingFile(null);}
    }
  }

  async function toggleRecording() {
    if(voiceBusy.current)return;
    const active=recorder.current;
    if(active&&(active.state==='recording'||active.state==='paused')){
      finishRequested.current=true;voiceBusy.current=true;setVoiceProcessing(true);
      clearPausedAudio();active.stop();return;
    }
    if(active)return;
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){
      setError(pt?'Este navegador não permite gravar áudio.':'Audio recording is unavailable.');return;
    }
    voiceBusy.current=true;setVoiceProcessing(true);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}
      audioStream.current=stream;recordingChunks.current=[];discardRecording.current=false;finishRequested.current=false;
      const preferred=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']
        .find(mime=>MediaRecorder.isTypeSupported(mime));
      const instance=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
      recorder.current=instance;
      const mime=instance.mimeType.split(';')[0] || 'audio/webm';
      instance.ondataavailable=e=>{
        if(e.data.size&&!discardRecording.current)recordingChunks.current.push(e.data);
        if(instance.state==='paused'&&!discardRecording.current&&recordingChunks.current.length&&mounted.current){
          const url=URL.createObjectURL(new Blob(recordingChunks.current,{type:mime}));
          if(pausedAudioRef.current)URL.revokeObjectURL(pausedAudioRef.current);
          pausedAudioRef.current=url;setPausedAudio(url);
        }
      };
      instance.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());audioStream.current=null;recorder.current=null;
        if(!mounted.current)return;
        clearPausedAudio();setRecording('idle');
        const blob=new Blob(recordingChunks.current,{type:mime});recordingChunks.current=[];
        try{
          if(discardRecording.current)return;
          if(!blob.size){setError(pt?'Não foi possível capturar áudio.':'No audio was captured.');return;}
          if(blob.size>10*1024*1024){setError(pt?'O áudio deve ter até 10 MB.':'Audio must be up to 10 MB.');return;}
          const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
          const file=new File([blob],'gravacao-'+Date.now()+'.'+ext,{type:mime});
          if(!finishRequested.current){stageFile(file);return;}
          try{await onAttach(file,'');}
          catch{if(mounted.current){stageFile(file);setError(pt?'Não foi possível enviar o áudio. Tente novamente.':'Could not send audio. Retry.');}}
        }finally{voiceBusy.current=false;if(mounted.current)setVoiceProcessing(false);}
      };
      instance.onerror=()=>{finishRequested.current=false;setError(pt?'Erro ao gravar áudio.':'Audio recording failed.');};
      instance.start(500);setRecordSeconds(0);setRecording('recording');setError('');
      setAttachmentsOpen(false);setEmojiOpen(false);voiceBusy.current=false;setVoiceProcessing(false);
    }catch{
      audioStream.current?.getTracks().forEach(t=>t.stop());audioStream.current=null;recorder.current=null;
      voiceBusy.current=false;if(mounted.current){setVoiceProcessing(false);setError(pt?'Permita o acesso ao microfone nas configurações.':'Allow microphone access to record.');}
    }
  }
  function pauseRecording(){
    if(voiceBusy.current)return;
    const instance=recorder.current;
    if(instance?.state==='recording'){
      instance.pause();setRecording('paused');
      if(recordingChunks.current.length){
        clearPausedAudio();
        const url=URL.createObjectURL(new Blob(recordingChunks.current,{type:instance.mimeType.split(';')[0]||'audio/webm'}));
        pausedAudioRef.current=url;setPausedAudio(url);
      }
      instance.requestData();
    }else if(instance?.state==='paused'){clearPausedAudio();instance.resume();setRecording('recording');}
  }
  function cancelRecording(){
    if(voiceBusy.current)return;
    discardRecording.current=true;finishRequested.current=false;clearPausedAudio();
    if(recorder.current&&recorder.current.state!=='inactive'){voiceBusy.current=true;setVoiceProcessing(true);recorder.current.stop();}
    audioStream.current?.getTracks().forEach(t=>t.stop());
    setRecording('idle');recordingChunks.current=[];
  }
  // Photos are finalized before preview (or when saving an edit). Upload the exact staged bytes.
  async function sendPhotos() {
    if(sendingPhotosRef.current||optimizingRef.current||!pendingPhotos.length)return;
    const files=[...pendingPhotos],caption=(serializeValue?.(value)??value).trim();
    if(files.some(file=>!file.size||file.size>10*1024*1024)){
      setError(pt?'Cada foto deve ter até 10 MB.':'Each photo must be up to 10 MB.');return;
    }
    sendingPhotosRef.current=true;setSendingPhotos(true);setError('');
    try{
      for(let index=0;index<files.length;index++){
        if(!mounted.current)return;
        await onAttach(files[index],index===0?caption:'');
        if(!mounted.current)return;
        const first=photoLocalUrls.current.shift();if(first)URL.revokeObjectURL(first);
        setPendingPhotos(old=>old.slice(1));setPhotoUrls(old=>old.slice(1));
        if(index===0)onChange('');
      }
      clearPending();
    }catch{if(mounted.current)setError(pt?'Não foi possível enviar as fotos. Tente novamente.':'Could not send photos. Retry.');}
    finally{sendingPhotosRef.current=false;if(mounted.current)setSendingPhotos(false);}
  }
  async function sendSelected(){
    if(!canSend)return;
    setEmojiOpen(false);emojiCaret.current=null;
    try{
      if(pendingPhotos.length){await sendPhotos();}
      else if(pending){await onAttach(pending,(serializeValue?.(value)??value).trim());clearPending();onChange('');}
      else if(pendingLocation){const {latitude,longitude}=pendingLocation;await onShareLocation(latitude,longitude,(serializeValue?.(value)??value).trim());setPendingLocation(null);onChange('');}
      else onSubmit();
    }catch{setError(pt?'Não foi possível enviar. Tente novamente.':'Could not send. Try again.');}
  }
  function chooseLocation(){
    setAttachmentsOpen(false);
    if(!navigator.geolocation){setError(pt?'Este dispositivo não oferece localização.':'Location is unavailable.');return;}
    setLocating(true);setError('');
    navigator.geolocation.getCurrentPosition(pos=>{
      if(!mounted.current)return;
      clearPending();
      setPendingLocation({latitude:pos.coords.latitude,longitude:pos.coords.longitude});
      setLocating(false);
    },()=>{
      if(!mounted.current)return;
      setLocating(false);setError(pt?'Não foi possível obter sua localização. Verifique a permissão.':'Could not get your location. Check permissions.');
    },{enableHighAccuracy:false,timeout:12000,maximumAge:30000});
  }
  function chosenFile(file?:File){if(file && !editing && !sendingPhotosRef.current){if(file.type.startsWith('video/'))void stageVideo(file);else stageFile(file);}}
  

  useLayoutEffect(()=>{
    const caret=emojiCaret.current,node=textareaRef.current;
    if(caret&&node&&caret.text===value)node.setSelectionRange(caret.position,caret.position);
  },[value,textareaRef]);

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.overflowY = 'hidden';
    node.style.height = 'auto';
    const height = Math.min(maxHeight, Math.max(48, node.scrollHeight));
    node.style.height = height + 'px';
    node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, textareaRef]);

  useEffect(() => {
    if (!emojiOpen && !attachmentsOpen) return;
    const outside = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) {
        setEmojiOpen(false);setAttachmentsOpen(false);setCameraOptions(false);
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setEmojiOpen(false);setAttachmentsOpen(false);setCameraOptions(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [emojiOpen,attachmentsOpen]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) sendSelected();
  }

  return <form ref={controls} onSubmit={submit}
    className="relative flex w-full min-w-0 flex-wrap items-end gap-1 sm:gap-2" data-live-message-composer>
    {photoCameraOpen&&<PhotoCameraModal pt={pt} onClose={()=>setPhotoCameraOpen(false)} onAccept={file=>{stagePhotos([file]);setPhotoCameraOpen(false);}}/>}
    {optimizing&&<div className="w-full min-w-0 space-y-2 rounded-lg border border-border bg-card p-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-semibold" title={pt?'Preparando mídia':'Preparing media'}>
          {optimizationKind==='image'?(pt?'Compactando foto':'Compressing photo'):(pt?'Compactando vídeo':'Compressing video')} · {optimizingFile?(optimizingFile.size/1048576).toFixed(1)+' MB':''}
        </span>
        <span className="shrink-0 text-muted-foreground">{optimizationProgress}%</span>
        <button type="button" className="min-h-9 shrink-0 rounded-md border border-border px-2 text-xs hover:bg-accent"
          onClick={()=>optimizationController.current?.abort()}>{pt?'Cancelar':'Cancel'}</button>
      </div>
      <progress max={100} value={optimizationProgress} className="h-2 w-full accent-primary"
        aria-label={pt?'Progresso da compactação':optimizationKind==='image'?'Image compression progress':'Video compression progress'}/>
      <p className="text-[11px] text-muted-foreground">
        {optimizationKind==='image'
          ?(pt?'Processando no dispositivo. As fotos serão enviadas após a otimização.':'Processing on this device. Photos will be sent after optimization.')
          :(pt?'Processando no dispositivo. O vídeo só será enviado depois de compactado.':'Processing on this device. Video will be uploaded only after compression.')}
      </p>
    </div>}
    {videoNotice&&!optimizing&&<p role="status" className="w-full text-xs text-muted-foreground">{videoNotice}</p>}
    {pendingPhotos.length>0 && <div className="w-full min-w-0 border border-border bg-muted/60 p-2 text-xs" role="status">
      <p className="mb-2 font-semibold">{pt?pendingPhotos.length+' foto(s) selecionada(s)':pendingPhotos.length+' selected photo(s)'}</p>
      <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {pendingPhotos.map((file,index)=><div key={photoUrls[index]} className="relative min-w-0 border border-border bg-background p-1">
          <img src={photoUrls[index]} alt={pt?'Foto '+(index+1):'Photo '+(index+1)} className="h-20 w-full object-contain"/>
          <div className="flex items-center justify-between gap-1 pt-1">
            <button type="button" aria-label={pt?'Editar foto '+(index+1):'Edit photo '+(index+1)} disabled={optimizing} onClick={()=>{setEditingPhotoIndex(index);setEditorOpen(true);}} className="grid size-7 place-items-center hover:bg-accent"><Pencil className="size-3.5"/></button>
            <button type="button" aria-label={pt?'Remover foto '+(index+1):'Remove photo '+(index+1)} disabled={optimizing} onClick={()=>removePhoto(index)} className="grid size-7 place-items-center hover:bg-accent"><X className="size-3.5"/></button>
          </div>
        </div>)}
      </div>
    </div>}
    {(pending && pendingUrl) && <div className="flex w-full min-w-0 items-start gap-2 border border-border bg-muted/60 p-2 text-xs" role="status">
      <div className="min-w-0 flex-1">
        <p className="mb-1 truncate font-semibold" title={mediaLabel(pending.type,pt)}>
          {mediaLabel(pending.type,pt)}
          {' · '}{(pending.size/1048576).toFixed(1)} MB
        </p>
        {pending.type.startsWith('image/') ? <div className="flex items-center gap-2">
          <img src={pendingUrl} alt={attachmentLabel(pending.type,locale)} className="max-h-36 max-w-[min(55vw,220px)] object-contain" />
          <button type="button" onClick={()=>setEditorOpen(true)}
            className="inline-flex items-center gap-1 border border-border px-2 py-1 hover:bg-accent">
            <Pencil className="size-4"/>{pt?'Editar imagem':'Edit image'}
          </button>
        </div> : pending.type.startsWith('audio/') ? <ChatAudioPlayer src={pendingUrl}/> :
          pending.type.startsWith('video/') ? <video src={pendingUrl} controls playsInline preload="metadata" className="max-h-36 max-w-full"/> :
          <span>{pt?'Arquivo pronto para enviar':'File ready to send'}</span>}
      </div>
      <button type="button" aria-label={pt?'Remover anexo':'Remove attachment'} onClick={clearPending}
        className="grid size-9 shrink-0 place-items-center hover:bg-accent"><X className="size-4"/></button>
    </div>}
    {pendingLocation && <div className="flex w-full items-center gap-2 border border-border bg-muted/60 p-2 text-xs">
      <MapPin className="size-5 text-primary"/>
      <span className="min-w-0 flex-1 truncate">{pt?'Localização pronta para enviar':'Location ready to send'} · {pendingLocation.latitude.toFixed(4)}, {pendingLocation.longitude.toFixed(4)}</span>
      <button type="button" onClick={()=>setPendingLocation(null)} aria-label={pt?'Remover localização':'Remove location'} className="grid size-9 place-items-center"><X className="size-4"/></button>
    </div>}
    {locating && <p className="w-full text-xs text-muted-foreground" role="status">{pt?'Obtendo localização…':'Getting location…'}</p>}
    {recording!=='idle' && <div className="flex w-full items-center gap-2 border border-destructive/40 bg-destructive/5 p-2 text-xs" role="status">
      <span className="size-2 animate-pulse rounded-full bg-destructive"/>
      <span className="flex-1">{recording==='paused'?(pt?'Gravação pausada':'Recording paused'):(pt?'Gravando áudio':'Recording audio')} · {Math.floor(recordSeconds/60)}:{String(recordSeconds%60).padStart(2,'0')}</span>
      <button type="button" onClick={pauseRecording} disabled={voiceProcessing} className="grid size-9 place-items-center hover:bg-accent" aria-label={recording==='paused'?(pt?'Retomar gravação':'Resume recording'):(pt?'Pausar gravação':'Pause recording')}>{recording==='paused'?<Play className="size-4"/>:<Pause className="size-4"/>}</button>
      <button type="button" onClick={cancelRecording} disabled={voiceProcessing} className="grid size-9 place-items-center hover:bg-accent" aria-label={pt?'Descartar áudio':'Discard audio'}><X className="size-4"/></button>
    </div>}
    {recording==='paused'&&pausedAudio&&<div className="w-full min-w-0" aria-label={pt?'Prévia do áudio pausado':'Paused audio preview'}><ChatAudioPlayer key={pausedAudio} src={pausedAudio}/></div>}
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    {editorOpen && (editingPhotoIndex!==null ? !!photoUrls[editingPhotoIndex] : !!pendingUrl&&!!pending) && typeof document!=='undefined' && createPortal(
      <div className="fixed inset-0 z-[120] flex flex-col bg-black/95 p-3 text-white sm:p-6" role="dialog" aria-modal="true" aria-label={pt?'Editar imagem':'Edit image'}>
        <ChatImageEditor key={editingPhotoIndex!==null?photoUrls[editingPhotoIndex]:pendingUrl!}
          src={editingPhotoIndex!==null?photoUrls[editingPhotoIndex]:pendingUrl!}
          onCancel={()=>{setEditorOpen(false);setEditingPhotoIndex(null);}}
          onSave={blob=>{if(editingPhotoIndex!==null)saveEditedPhoto(blob);
            else if(pending){const filename=pending.name.replace(/\.[^.]+$/,'')+'-editada.png';stageFile(new File([blob],filename,{type:'image/png'}));setEditorOpen(false);}}}/>
      </div>,document.body)}
    <div className="shrink-0">
      <button type="button" disabled={recording!=='idle'||voiceProcessing} aria-label={pt ? 'Adicionar anexo' : 'Add attachment'}
        aria-expanded={attachmentsOpen} aria-haspopup="dialog"
        onClick={() => { setAttachmentsOpen(v => !v); setCameraOptions(false); setEmojiOpen(false); }}
        className="grid size-11 lg:size-12 place-items-center text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Plus className={cn('size-6 transition-transform',attachmentsOpen && 'rotate-45')} />
      </button>
      {attachmentsOpen&&<div role="dialog" aria-label={pt?'Adicionar à conversa':'Add to chat'} className="attachment-popover absolute bottom-full inset-x-0 z-40 mb-2 max-h-[min(50dvh,320px)] overflow-y-auto overscroll-contain border border-border bg-popover p-2 text-popover-foreground shadow-xl">
        <div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-semibold">{pt?'Adicionar à conversa':'Add to chat'}</span><button type="button" onClick={()=>{setAttachmentsOpen(false);setCameraOptions(false)}} aria-label={pt?'Fechar anexos':'Close attachments'} className="grid size-7 place-items-center hover:bg-accent"><X className="size-4"/></button></div>
        {cameraOptions ? <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>{setPhotoCameraOpen(true);setCameraOptions(false);setAttachmentsOpen(false);}}
            className="flex min-h-16 flex-col items-center justify-center border border-border p-2 text-xs hover:bg-accent"><Camera className="size-5"/>{pt?'Tirar foto':'Take photo'}</button>
          <button type="button" onClick={()=>{cameraKindRef.current='video';cameraRef.current?.setAttribute('accept','video/*');cameraRef.current?.click();setCameraOptions(false);setAttachmentsOpen(false);}}
            className="flex min-h-16 flex-col items-center justify-center border border-border p-2 text-xs hover:bg-accent"><Video className="size-5"/>{pt?'Gravar vídeo':'Record video'}</button>
          <button type="button" onClick={()=>setCameraOptions(false)} className="col-span-2 text-xs hover:bg-accent">{pt?'Voltar':'Back'}</button>
        </div> : <div>
          <div className="grid grid-cols-4 gap-1">
          {ATTACHMENTS.map(({icon: Icon,pt:labelPt,en},index) => <button key={en} type="button"
            disabled={sending || sendingPhotos || editing || optimizing || recording!=='idle'}
            onClick={() => {
              if(index===1){setCameraOptions(true);return;}
              if(index===3){chooseLocation();return;}
              [galleryRef,cameraRef,fileRef][index]?.current?.click();
              setAttachmentsOpen(false);
            }}
            title={index===3 ? (pt ? 'Compartilhar localização atual' : 'Share current location') : undefined}
            className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border border-border/70 px-0.5 text-[10px] text-center break-words hover:bg-accent disabled:opacity-40"
            aria-label={pt ? labelPt : en}>
            <Icon className="size-5 text-primary"/><span className="break-words text-center">{pt ? labelPt : en}</span>
          </button>)}
          {onCreateEvent&&<button type="button" disabled={editing||sending||sendingPhotos||optimizing||recording!=='idle'} onClick={()=>{setAttachmentsOpen(false);onCreateEvent()}} className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border border-border/70 px-0.5 text-[10px] text-center break-words hover:bg-accent disabled:opacity-40"><CalendarPlus className="size-5 text-primary"/>{pt?'Criar compromisso':'Create event'}</button>}
          {onCreateList&&<button type="button" disabled={editing||sending||sendingPhotos||optimizing||recording!=='idle'} onClick={()=>{setAttachmentsOpen(false);onCreateList()}} className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border border-border/70 px-0.5 text-[10px] text-center break-words hover:bg-accent disabled:opacity-40"><ListChecks className="size-5 text-primary"/>{pt?'Criar lista':'Create list'}</button>}
          </div>
        </div>}
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          {pt ? 'Anexos até 10 MB; vídeos até 30 MB após compactação (originais até 300 MB).' : 'Attachments up to 10 MB; videos up to 30 MB after compression (originals up to 300 MB).'}
        </p>
      </div>}
    </div>
    <input ref={galleryRef} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" className="sr-only"
      onChange={e => { const files=Array.from(e.target.files??[]); e.target.value=''; selectGallery(files); }} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; if(file?.type.startsWith('image/'))void stageCameraPhoto(file);else chosenFile(file); }} />
    <input ref={fileRef} type="file" accept={'.pdf,.txt,.zip,.mp3,.m4a,.ogg,.webm,.wav,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,application/octet-stream'+(allowOffice?',.doc,.docx,.xls,.xlsx,.ppt,.pptx':'')} className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; chosenFile(file); }} />
    <textarea ref={textareaRef} rows={1} value={value} disabled={recording!=='idle'||voiceProcessing}
      onPaste={e=>{const file=Array.from(e.clipboardData.items).find(item=>item.kind==='file' && item.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();void prepareGalleryPhotos([file]);}}}
      onKeyDown={event=>{
        if(event.key!=='Enter'||event.shiftKey||event.nativeEvent.isComposing||event.keyCode===229)return;
        const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
        if(mobile||window.matchMedia?.('(pointer: coarse)').matches)return;
        event.preventDefault();
        if(canSend&&!event.repeat)sendSelected();
      }}
      onFocus={event=>{
        const caret=emojiCaret.current;
        if(!caret||caret.text!==event.currentTarget.value)return;
        const node=event.currentTarget;node.setSelectionRange(caret.position,caret.position);
        requestAnimationFrame(()=>{if(emojiCaret.current===caret&&document.activeElement===node&&node.value===caret.text){node.setSelectionRange(caret.position,caret.position);emojiCaret.current=null;}});
      }}
      onChange={event => {emojiCaret.current=null;onChange(event.target.value)}}
      onSelect={event => onSelectionChange?.(event.currentTarget.value,
        event.currentTarget.selectionStart,event.currentTarget.selectionEnd)}
      enterKeyHint="enter" maxLength={4000}
      aria-label={pt ? 'Escrever mensagem' : 'Write a message'}
      data-message-composer placeholder={editing ? (pt ? 'Editar mensagem…' : 'Edit message…') : (pt ? 'Mensagem…' : 'Message…')}
      className="min-h-12 max-h-52 min-w-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-3 text-base leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
    />
    <div className="relative shrink-0">
      <button type="button" aria-label={pt ? 'Abrir lista de emojis' : 'Open emoji picker'}
        aria-expanded={emojiOpen} aria-haspopup="dialog"
        onPointerDown={event => event.preventDefault()}
        onClick={() => { setEmojiOpen(v => !v); setAttachmentsOpen(false); }}
        className="grid size-11 lg:size-12 place-items-center text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Smile className="size-5"/>
      </button>
      {emojiOpen && <div role="dialog" aria-label={pt ? 'Emojis' : 'Emojis'}
        className="absolute bottom-full right-0 z-40 mb-2 w-[min(276px,calc(100vw-20px))] max-h-[min(252px,42dvh)] overflow-y-auto border border-border bg-popover p-2 text-popover-foreground shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold">{pt ? 'Emojis' : 'Emojis'}</p>
          <button type="button" aria-label={pt ? 'Fechar emojis' : 'Close emojis'}
            onPointerDown={event => event.preventDefault()}
            onClick={() => setEmojiOpen(false)} className="grid size-8 place-items-center hover:bg-accent">
            <X className="size-4"/>
          </button>
        </div>
        {EMOJI_GROUPS.map(group => <section key={group.en} className="mb-2">
          <p className="mb-1 text-xs text-muted-foreground">{pt ? group.pt : group.en}</p>
          <div className="grid grid-cols-6 gap-1">
            {group.symbols.map(emoji => <button type="button" key={emoji}
              aria-label={emoji} onPointerDown={event => event.preventDefault()}
              onClick={() => {
                const next=value+emoji;if(next.length>4000)return;
                emojiCaret.current={text:next,position:next.length};onChange(next);
              }}
              className="grid size-8 place-items-center text-base leading-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{emoji}</button>)}
          </div>
        </section>)}
      </div>}
    </div>
    {onGif&&<button type="button" onClick={onGif} aria-expanded={gifOpen}
        aria-label={pt?'Selecionar GIF':'Choose GIF'}
        className={cn('grid h-11 lg:h-12 shrink-0 place-items-center rounded-lg px-1.5 text-[11px] font-bold text-muted-foreground hover:bg-accent',gifOpen&&'text-primary')}>GIF</button>}
    {canSend
      ? <button type="submit" onPointerDown={event=>{if(emojiOpen)event.preventDefault();}} aria-label={pt ? 'Enviar mensagem' : 'Send message'}
        className="chat-send-touch grid size-11 lg:size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Send className="size-5"/>
      </button>
      : <button type="button" onClick={()=>void toggleRecording()} disabled={voiceProcessing || sending || sendingPhotos || editing || optimizing || (!!pending && recording==='idle') || pendingPhotos.length>0}
        aria-label={recording!=='idle'?(pt?'Finalizar gravação':'Finish recording'):(pt?'Gravar áudio':'Record voice note')}
        className={cn('chat-send-touch grid size-11 lg:size-12 shrink-0 place-items-center',recording!=='idle'?'bg-destructive text-destructive-foreground':'text-muted-foreground',sending && 'opacity-40')}>
        {voiceProcessing?<span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" role="status"/>:recording!=='idle'?<Send className="size-5"/>:<Mic className="size-5"/>}
      </button>}
  </form>;
}
