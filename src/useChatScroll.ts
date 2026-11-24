import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Message} from './types';
export function useChatScroll(roomId:string|null,messages:Message[],loading:boolean,filtering:boolean,ownId:string,open=true){
 const historyRef=useRef<HTMLDivElement>(null),near=useRef(true),initialized=useRef<string|null>(null),lastIds=useRef(new Set<string>()),previousRoom=useRef<string|null>(null),previousTail=useRef(0),previousOpen=useRef(open),prepend=useRef<{height:number;top:number}|null>(null);
 const [away,setAway]=useState(false),[newCount,setNewCount]=useState(0);
 function jump(){const el=historyRef.current;if(el)el.scrollTop=el.scrollHeight;near.current=true;setAway(false);setNewCount(0)}
 function onScroll(){const el=historyRef.current;if(!el)return;const bottom=el.scrollHeight-el.scrollTop-el.clientHeight<96;near.current=bottom;setAway(!bottom);if(bottom)setNewCount(0)}
 function preserveOlder(){const el=historyRef.current;if(el)prepend.current={height:el.scrollHeight,top:el.scrollTop}}
 useLayoutEffect(()=>{
  if(previousRoom.current!==roomId||(open&&!previousOpen.current)){previousRoom.current=roomId;initialized.current=null;lastIds.current=new Set();previousTail.current=0;prepend.current=null;near.current=true;setAway(false);setNewCount(0)}
  previousOpen.current=open;const el=historyRef.current;if(!el||loading||!open)return;
  if(prepend.current){const old=prepend.current;el.scrollTop=old.top+el.scrollHeight-old.height;prepend.current=null;lastIds.current=new Set(messages.map(m=>m.id));return;}
  if(!initialized.current&&messages.length){jump();initialized.current=roomId;}
  else if(!filtering){const added=messages.filter(m=>!lastIds.current.has(m.id)&&Date.parse(m.createdAt)>=previousTail.current);if(near.current||added.some(m=>m.senderId===ownId))jump();else if(added.length)setNewCount(n=>n+added.filter(m=>m.senderId!==ownId).length)}
  lastIds.current=new Set(messages.map(m=>m.id));previousTail.current=Math.max(previousTail.current,...messages.map(m=>Date.parse(m.createdAt)));
 },[roomId,messages,loading,filtering,ownId,open]);
 useEffect(()=>{const el=historyRef.current;if(!el||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(()=>{if(near.current)el.scrollTop=el.scrollHeight});observer.observe(el);for(const child of el.children)observer.observe(child);return()=>observer.disconnect()},[roomId,messages.length]);
 return {historyRef,onScroll,jump,away,newCount,preserveOlder};
}
