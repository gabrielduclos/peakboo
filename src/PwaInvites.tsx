import {useEffect,useRef,useState} from "react";
import {BellRing,Download} from "lucide-react";
import {Button,Modal} from "./components";
import {request} from "./api";
import {canPush,enablePush,pushConsent,syncPush} from "./pwa";
import {installationState,installNative,localDay,markInstallInvite,platform,shouldInviteInstall,watchInstallation} from "./pwaInstall";

export function PwaInvites({userId,lang,blocked}:{userId:string;lang:string;blocked:boolean}){
 const pt=lang==="pt",device=platform();
 const [installation,setInstallation]=useState(installationState);
 const [ready,setReady]=useState(false),[visible,setVisible]=useState(!document.hidden);
 const [installOpen,setInstallOpen]=useState(false),[pushOpen,setPushOpen]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [publicKey,setPublicKey]=useState("");
 const triedPush=useRef("");
 const lock=useRef(false);
 useEffect(()=>{
  const update=()=>setInstallation(installationState());
  const visibility=()=>{setVisible(!document.hidden);update()};
  const stop=watchInstallation(update);
  const timer=setTimeout(()=>{setReady(true);update()},1200);
  document.addEventListener("visibilitychange",visibility);
  return()=>{stop();clearTimeout(timer);document.removeEventListener("visibilitychange",visibility)};
 },[]);
 useEffect(()=>{
  if(!userId||installation.installed){setInstallOpen(false);return;}
  if(!ready||blocked||!visible||pushOpen||installOpen||!("serviceWorker" in navigator))return;
  if(shouldInviteInstall(installation.installed,installation.lastDay,localDay(),installation.native||device!=="desktop")){
   markInstallInvite();setInstallation(installationState());setInstallOpen(true);
  }
 },[userId,ready,blocked,visible,pushOpen,installOpen,installation,device]);
 useEffect(()=>{
  if(!userId){triedPush.current="";setPublicKey("");setPushOpen(false);return}
  if(!ready||blocked||!visible||installOpen||!canPush()||triedPush.current===userId)return;
  // Installation takes priority even before the installation modal has mounted.
  if(shouldInviteInstall(installation.installed,installation.lastDay,localDay(),installation.native||device!=="desktop"))return;
  if(Notification.permission==="denied"){triedPush.current=userId;return}
  let alive=true;
  (async()=>{
   const active=await syncPush(userId,lang);
   if(!alive)return;
   if(active){triedPush.current=userId;return}
   const config=await request("/api/push/config");
   if(!alive)return;
   triedPush.current=userId;
   if(config.enabled&&config.publicKey){setPublicKey(config.publicKey);setError("");setPushOpen(true)}
  })().catch(()=>{if(alive)triedPush.current=userId});
  return()=>{alive=false};
 },[userId,lang,ready,blocked,visible,installOpen,installation,device]);
 const dismissInstall=()=>{if(!lock.current)setInstallOpen(false)};
 const dismissPush=()=>{if(!lock.current)setPushOpen(false)};
 async function install(){
  if(lock.current)return;
  lock.current=true;setBusy(true);setError("");
  try{const result=await installNative();if(result!=="unavailable")setInstallOpen(false)}
  catch{setError(pt?"Use o menu do navegador para instalar o aplicativo.":"Use the browser menu to install the app.")}
  finally{lock.current=false;setBusy(false)}
 }
 async function activate(){
  if(lock.current||!userId||!publicKey)return;
  lock.current=true;setBusy(true);setError("");
  try{await enablePush(userId,lang,publicKey,pushConsent(userId)?.preview||false);setPushOpen(false)}
  catch(e){setError((e as Error).message==="PUSH_DENIED"?(pt?"Permissão negada. Você pode ativá-la nas configurações do navegador.":"Permission denied. You can enable it in browser settings."):(pt?"Não foi possível ativar. Tente novamente.":"Could not enable. Try again."))}
  finally{lock.current=false;setBusy(false)}
 }
 const later=pt?"Agora não":"Not now";
 return <>
  <Modal open={!!userId&&installOpen&&!blocked&&!pushOpen&&!installation.installed} onOpenChange={v=>{if(!v)dismissInstall()}} title={pt?"Instale o Peakboo":"Install Peakboo"} description={pt?"Acesse seus grupos e compromissos direto da tela inicial.":"Access your groups and events directly from your home screen."} closeLabel={pt?"Fechar":"Close"} className="pwa-invite-modal">
   <div className="pwa-invite-body">
    <img src="/icon-192.png" width="64" height="64" alt="" className="pwa-invite-icon"/>
    {installation.native?<Button type="button" busy={busy} onClick={()=>void install()}><Download size={18}/>{pt?"Instalar aplicativo":"Install app"}</Button>:<p className="pwa-invite-instructions">{device==="ios"?(pt?"No Safari, toque em Compartilhar → Adicionar à Tela de Início.":"In Safari, tap Share → Add to Home Screen."):(pt?"Abra o menu do navegador (⋮) e escolha Instalar aplicativo ou Adicionar à tela inicial.":"Open the browser menu (⋮) and choose Install app or Add to Home screen.")}</p>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    <Button type="button" variant="ghost" disabled={busy} onClick={dismissInstall}>{later}</Button>
   </div>
  </Modal>
  <Modal open={pushOpen&&!blocked&&!installOpen&&!!userId&&canPush()} onOpenChange={v=>{if(!v)dismissPush()}} title={pt?"Ative as notificações":"Enable notifications"} description={pt?"Receba mensagens e lembretes mesmo quando estiver fora do Peakboo.":"Receive messages and reminders even when you're away from Peakboo."} closeLabel={pt?"Fechar":"Close"} className="pwa-invite-modal">
   <div className="pwa-invite-body"><div className="pwa-invite-bell"><BellRing size={28}/></div>
    <Button type="button" busy={busy} onClick={()=>void activate()}><BellRing size={18}/>{pt?"Ativar notificações":"Enable notifications"}</Button>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <Button type="button" variant="ghost" disabled={busy} onClick={dismissPush}>{later}</Button>
   </div>
  </Modal>
 </>;
}
