// Stable pseudo-random name color, independent of message order, theme or session.
export const SENDER_COLOR_COUNT=12;
export function senderColorIndex(userId:string):number{
 let hash=2166136261;
 for(let i=0;i<userId.length;i++)hash=Math.imul(hash^userId.charCodeAt(i),16777619);
 return (hash>>>0)%SENDER_COLOR_COUNT;
}
