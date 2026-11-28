import {useEffect,useState} from "react";
import {Bell,BellOff,Download} from "lucide-react";
import {Button} from "./components";
import {request} from "./api";
import {canPush,pushRegistration,enablePush,disablePush,updatePreview,pushConsent} from "./pwa";
import type {Room} from "./types";
export function PushSettings({userId,lang,rooms}:{userId:string;lang:string;rooms:Room[]}){
 const pt=lang==="pt",supported=canPush();
 const [publicKey,setPublicKey]=useState(""),[active,setActive]=useState(false),[preview,setPreview]=useState(false),[muted,setMuted]=useState<string[]>([]),[busy,setBusy]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let alive=true;setLoading(true);
  (async()=>{
   const [config,prefs]=await Promise.all([request("/api/push/config"),request("/api/push/muted")]);
   if(!alive)return;setPublicKey(config.enabled?config.publicKey||"":"");setMuted(prefs.rooms||[]);
   if(supported){const reg=await pushRegistration(),sub=await reg.pushManager.getSubscription();if(sub){const status=await request("/api/push/status","POST",{endpoint:sub.endpoint});if(alive){setActive(status.active);setPreview(status.active?status.preview:!!pushConsent(userId)?.preview)}}}
  })().catch(()=>{if(alive)setError(pt?"Não foi possível carregar as notificações.":"Could not load notifications.")}).finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false}
 },[userId,supported,lang]);
 const run=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);setError("");try{await fn()}catch(e){setError((e as Error).message==="PUSH_DENIED"?(pt?"Permissão negada. Confira as configurações do navegador.":"Permission denied. Check browser settings."):(pt?"Não foi possível concluir. Tente novamente.":"Could not complete. Try again."))}finally{setBusy("")}};
 return <section className="push-settings">
  <h3>{pt?"Notificações push":"Push notifications"}</h3>
  <p className="muted">{pt?"Receba mensagens e avisos da agenda mesmo com o aplicativo fechado.":"Receive messages and calendar alerts even when the app is closed."}</p>
  {loading?<div className="social-skeleton" role="status" aria-label={pt?"Carregando":"Loading"}/>:<>
   {!supported&&<p className="muted">{pt?"Instale o PedroChat e abra o aplicativo pela tela inicial para ativar as notificações push.":"Install PedroChat and open it from your home screen to enable push notifications."}</p>}
   {supported&&<Button type="button" variant={active?"outline":"default"} busy={busy==="device"} disabled={!!busy||(!active&&!publicKey)} onClick={()=>void run("device",async()=>{if(active){await disablePush(userId);setActive(false)}else{await enablePush(userId,lang,publicKey,preview);setActive(true)}})}>{active?<BellOff size={18}/>:<Bell size={18}/>} {active?(pt?"Desativar neste dispositivo":"Disable on this device"):(pt?"Ativar neste dispositivo":"Enable on this device")}</Button>}
   {supported&&!publicKey&&<p className="muted">{pt?"Push indisponível no servidor.":"Push is unavailable on the server."}</p>}
   <label className="push-option"><span>{pt?"Mostrar prévia do conteúdo":"Show content preview"}</span><input type="checkbox" checked={preview} disabled={!!busy} onChange={e=>{const value=e.target.checked;if(!active){setPreview(value);return}void run("preview",async()=>{await updatePreview(userId,lang,value);setPreview(value)})}}/></label>
   <h3>{pt?"Silenciar grupos":"Mute groups"}</h3>
   <p className="muted">{pt?"Silencia notificações push, sem ocultar os avisos internos.":"Mute push notifications without hiding in-app notices."}</p>
   {rooms.map(room=><label className="push-option" key={room.id}><span>{room.name}</span><input type="checkbox" checked={muted.includes(room.id)} disabled={!!busy} onChange={e=>{const value=e.target.checked;void run(room.id,async()=>{await request("/api/push/muted/"+room.id,"PUT",{muted:value});setMuted(old=>value?[...old,room.id]:old.filter(id=>id!==room.id))})}}/></label>)}
  </>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  <div className="push-install-hint"><Download size={18}/><span>{pt?"Instale o PedroChat usando o menu do seu navegador.":"Install PedroChat using your browser menu."}</span></div>
 </section>
}
