import type {Message} from "./types";
export type ReactionChange={messageId:string;userId:string;emoji:string;active:boolean};
export type LiveChange={roomId?:string;deletedRoomId?:string;profileChanged?:boolean;reaction?:ReactionChange};
export function applyReaction(message:Message,change:ReactionChange):Message{
 if(message.id!==change.messageId||message.deleted)return message;
 const matches=(r:Message["reactions"][number])=>r.userId===change.userId&&r.emoji===change.emoji;
 const has=message.reactions.some(matches);if(has===change.active)return message;
 return {...message,reactions:change.active?[...message.reactions,{userId:change.userId,emoji:change.emoji}]:message.reactions.filter(r=>!matches(r))};
}
