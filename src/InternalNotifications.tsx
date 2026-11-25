import {useEffect,useMemo,useState} from "react";
import {reactionPreview} from "./roomPreview";
import {Bell,CalendarDays,MessageCircle,Check,Smile} from "lucide-react";
import {Button} from "./components";
import type {Boot,Plan,Room} from "./types";
const shortName=(name:string)=>{const parts=name.trim().split(/\s+/);return parts.length>1?parts[0]+" "+parts.at(-1):parts[0]};
export type AgendaNotice={id:string;eventId:string;roomId:string;title:string;roomName:string;action:"created"|"updated"|"cancelled"|"confirmed"|"reminder";actorName?:string;at:string;minutes?:number};
function readIds(key:string):string[]{try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value.filter((v:unknown)=>typeof v==="string"):[]}catch{return []}}
export function useInternalNotifications(boot:Boot){
 const key="peakboo-notifications-v1:"+boot.user.id;
 const [seen,setSeen]=useState(()=>({key,ids:readIds(key)}));
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{setSeen({key,ids:readIds(key)})},[key]);
 useEffect(()=>{const update=()=>{if(!document.hidden)setNow(Date.now())};const timer=setInterval(update,30000);document.addEventListener("visibilitychange",update);update();return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",update)}},[]);
 const notices=useMemo<AgendaNotice[]>(()=>{
  if(!boot.user.id)return [];
  const rooms=new Set(boot.rooms.map(r=>r.id));
  const list:AgendaNotice[]=(boot.activity||[]).filter(a=>rooms.has(a.roomId)).map(a=>({id:"activity:"+a.id,eventId:a.eventId,roomId:a.roomId,title:a.eventTitle,roomName:a.roomName,action:a.action,actorName:a.actorName,at:a.createdAt}));
  for(const event of boot.events){
   if(event.cancelled||!rooms.has(event.roomId)||event.rsvps.some(r=>r.userId===boot.user.id&&r.status==="no"))continue;
   const start=Date.parse(event.startsAt),remaining=start-now;
   if(!Number.isFinite(start)||remaining<0)continue;
   for(const minutes of [60,15]){
    if(remaining>minutes*60000)continue;
    list.push({id:"reminder:"+event.id+":"+event.startsAt+":"+minutes,eventId:event.id,roomId:event.roomId,title:event.title,roomName:event.roomName||boot.rooms.find(r=>r.id===event.roomId)?.name||"",action:"reminder",minutes,at:new Date(start-minutes*60000).toISOString()});
   }
  }
  return list.sort((a,b)=>b.at.localeCompare(a.at));
 },[boot.activity,boot.events,boot.rooms,boot.user.id,now]);
 const read=new Set(seen.key===key?seen.ids:readIds(key));
 const agendaUnread=notices.filter(n=>!read.has(n.id)).length;
 const reactionNotices=(boot.reactionNotices||[]).filter(n=>boot.rooms.some(r=>r.id===n.roomId));
 const reactionUnread=reactionNotices.filter(n=>!read.has("reaction:"+n.id)).length;
 const messageUnread=boot.rooms.reduce((total,r)=>total+(r.unread||0),0);
 const mark=(ids:string[])=>{setSeen(old=>{const next=[...new Set([...(old.key===key?old.ids:readIds(key)),...ids])].slice(-1500);try{localStorage.setItem(key,JSON.stringify(next))}catch{}return {key,ids:next}})};
 return {notices,reactionNotices,read,agendaUnread,reactionUnread,messageUnread,total:agendaUnread+messageUnread+reactionUnread,mark};
}
export function NotificationBadge({count}:{count:number}){return count>0?<b className="notification-count" aria-label={String(count)}>{count>99?"99+":count}</b>:null}
export function NotificationCenter({boot,center,lang,onRoom,onEvent}:{boot:Boot;center:ReturnType<typeof useInternalNotifications>;lang:string;onRoom:(room:Room)=>void;onEvent:(event:Plan|undefined)=>void}){
 const pt=lang==="pt",rooms=boot.rooms.filter(r=>r.unread>0);
 const labels={created:pt?"Novo compromisso":"New event",updated:pt?"Compromisso atualizado":"Event updated",cancelled:pt?"Compromisso cancelado":"Event cancelled",confirmed:pt?"Presença confirmada":"Attendance confirmed",reminder:pt?"Lembrete de agenda":"Calendar reminder"};
 return <section className="notification-center" aria-label={pt?"Notificações internas":"In-app notifications"}>
  {center.agendaUnread>0&&<Button variant="outline" className="full-width" onClick={()=>center.mark(center.notices.map(n=>n.id))}><Check size={16}/>{pt?"Marcar avisos da agenda como lidos":"Mark calendar notices as read"}</Button>}
  {rooms.map(r=><button type="button" className="notification-row notification-unread" key={r.id} onClick={()=>onRoom(r)}><MessageCircle size={20}/><span><strong>{r.name}</strong><small>{r.unread} {pt?"mensagens não lidas":"unread messages"}</small></span><NotificationBadge count={r.unread}/></button>)}
  {center.reactionUnread>0&&<Button variant="outline" className="full-width" onClick={()=>center.mark(center.reactionNotices.map(n=>"reaction:"+n.id))}><Check size={16}/>{pt?"Marcar reações como lidas":"Mark reactions as read"}</Button>}
  {center.reactionNotices.map(n=><button type="button" key={"reaction:"+n.id} className={"notification-row"+(!center.read.has("reaction:"+n.id)?" notification-unread":"")} onClick={()=>{center.mark(["reaction:"+n.id]);const room=boot.rooms.find(r=>r.id===n.roomId);if(room)onRoom(room)}}><Smile size={20}/><span><strong>{reactionPreview(n,pt)}</strong><small>{n.roomName} · {new Date(n.createdAt).toLocaleString(pt?"pt-BR":"en",{dateStyle:"short",timeStyle:"short"})}</small></span>{!center.read.has("reaction:"+n.id)&&<span className="notification-unread-dot" aria-hidden="true"/>}</button>)}
  {center.notices.map(n=><button type="button" key={n.id} className={"notification-row"+(!center.read.has(n.id)?" notification-unread":"")} onClick={()=>{center.mark([n.id]);onEvent(boot.events.find(e=>e.id===n.eventId))}}><CalendarDays size={20}/><span><strong>{n.action==="confirmed"&&n.actorName?shortName(n.actorName)+(pt?" confirmou presença":" confirmed attendance"):labels[n.action]}</strong><small>{n.title}{n.roomName?" · "+n.roomName:""}</small>{n.minutes&&<small>{pt?"Aviso de ":"Reminder: "}{n.minutes} min</small>}<small>{new Date(n.at).toLocaleString(pt?"pt-BR":"en",{dateStyle:"short",timeStyle:"short"})}</small></span>{!center.read.has(n.id)&&<span className="notification-unread-dot" aria-hidden="true"/>}</button>)}
  {!rooms.length&&!center.notices.length&&!center.reactionNotices.length&&<div className="notification-empty"><Bell size={28}/><p>{pt?"Nenhuma notificação por enquanto.":"No notifications yet."}</p></div>}
 </section>
}
