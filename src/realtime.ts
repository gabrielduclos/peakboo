import type {Message} from "./types";
export type ReactionChange={messageId:string;userId:string;emoji:string;active:boolean};
export type LiveChange={roomId?:string;deletedRoomId?:string;profileChanged?:boolean;reaction?:ReactionChange};
export function applyReaction(message:Message,change:ReactionChange):Message{
 if(message.id!==change.messageId||message.deleted)return message;
 const matches=(r:Message["reactions"][number])=>r.userId===change.userId&&r.emoji===change.emoji;
 if(!change.active){
  if(!message.reactions.some(matches))return message;
  return {...message,reactions:message.reactions.filter(r=>!matches(r))};
 }
 const own=message.reactions.filter(r=>r.userId===change.userId);
 if(own.length===1&&matches(own[0]))return message;
 return {...message,reactions:[...message.reactions.filter(r=>r.userId!==change.userId),{userId:change.userId,emoji:change.emoji}]};
}
