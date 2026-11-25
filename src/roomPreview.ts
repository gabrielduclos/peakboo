import type {Message,Room,RoomPreview,ReactionNotice} from "./types";
export function previewContent(text:string,mime:string|null|undefined,pt:boolean){
  const label=mime?(mime.startsWith("image/")?(pt?"Foto":"Photo"):mime.startsWith("video/")?(pt?"Vídeo":"Video"):mime.startsWith("audio/")?(pt?"Áudio":"Audio"):(pt?"Documento":"Document")):"";
  const clean=(text||"").replace(/\s+/g," ").trim();
  return [label,clean].filter(Boolean).join(" · ").slice(0,160);
}
export function reactionPreview(r:Pick<ReactionNotice,"actorName"|"emoji"|"text"|"mime">,pt:boolean){
  const content=previewContent(r.text,r.mime,pt);
  return pt?r.actorName+" reagiu "+r.emoji+" à sua mensagem"+(content?": "+content:""):r.actorName+" reacted "+r.emoji+" to your message"+(content?": "+content:"");
}
export function roomPreview(room:Room,userId:string,pt:boolean,fallback:string){
  const p=room.preview;
  if(!p)return room.lastText||room.description||fallback;
  if(p.kind==="reaction")return reactionPreview(p,pt);
  const who=p.senderId===userId?(pt?"Você":"You"):p.senderName;
  const content=p.deleted?(pt?"Mensagem apagada":"Deleted message"):previewContent(p.text,p.mime,pt)||(p.eventId?(pt?"Compromisso":"Event"):fallback);
  return (who?who+": ":"")+content;
}
export function messageRoomPreview(m:Message):RoomPreview{
  return {kind:"message",senderId:m.senderId,senderName:m.senderName,text:m.text,mime:m.attachment?.mime,deleted:m.deleted,eventId:m.eventId};
}
export function demoRoomPreview(room:Room,messages:Message[]|undefined):Room{
  if(!messages?.length)return room;
  const latest=messages.reduce((a,b)=>Date.parse(b.createdAt)>=Date.parse(a.createdAt)?b:a);
  return {...room,lastAt:latest.createdAt,preview:messageRoomPreview(latest)};
}
