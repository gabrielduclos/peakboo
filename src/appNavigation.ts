import {useEffect,useRef} from "react";

type View="chats"|"calendar";
type Route="groups"|"calendar"| `room:${string}`;
type Entry={account:string;route:Route;previous?:Route};
const key="peakbooNavigation";

export function useAppNavigation(account:string,view:View,mobileChat:boolean,selected:string|null,roomIds:string[],setView:(v:View)=>void,setMobileChat:(v:boolean)=>void,setSelected:(v:string|null)=>void){
 const route:Route=view==="calendar"?"calendar":mobileChat&&selected?`room:${selected}`:"groups";
 const current=useRef<Entry|null>(null);
 const latest=useRef({account,roomIds,setView,setMobileChat,setSelected});
 latest.current={account,roomIds,setView,setMobileChat,setSelected};
 useEffect(()=>{
  const pop=(event:PopStateEvent)=>{
   const x=latest.current;if(!x.account)return;
   const entry=event.state?.[key] as Entry|undefined;
   let next:Route=entry?.account===x.account?entry.route:"groups";
   if(next.startsWith("room:")&&!x.roomIds.includes(next.slice(5)))next="groups";
   current.current={account:x.account,route:next,previous:entry?.account===x.account?entry.previous:undefined};
   if(next!==entry?.route||entry?.account!==x.account)history.replaceState({...history.state,[key]:current.current},"");
   x.setView(next==="calendar"?"calendar":"chats");
   x.setMobileChat(next.startsWith("room:"));
   if(next.startsWith("room:"))x.setSelected(next.slice(5));
  };
  window.addEventListener("popstate",pop);
  return()=>window.removeEventListener("popstate",pop);
 },[]);
 useEffect(()=>{
  if(!account){current.current=null;return}
  const old=current.current;
  if(!old||old.account!==account){
   const root:Entry={account,route:"groups"};
   history.replaceState({...history.state,[key]:root},"");
   current.current=root;
   if(route==="groups")return;
  }
  const previous=current.current!;
  if(previous.route===route)return;
  if(previous.previous===route&&history.state?.[key]?.route===previous.route){
   // The in-app back button consumes the same history entry as Android Back.
   history.back();
   return;
  }
  const entry:Entry={account,route,previous:previous.route};
  history.pushState({...history.state,[key]:entry},"");
  current.current=entry;
 },[account,route]);
}

// A mobile virtual keyboard can shrink only the visual viewport, not 100dvh.
export function useMobileViewport(){
 useEffect(()=>{
  const viewport=window.visualViewport,root=document.documentElement;
  const update=()=>{
   if(!viewport||window.innerWidth>700||Math.abs(viewport.scale-1)>0.01){
    root.style.removeProperty("--peakboo-visible-height");
    root.style.removeProperty("--peakboo-visible-top");
    return;
   }
   root.style.setProperty("--peakboo-visible-height",`${viewport.height}px`);
   root.style.setProperty("--peakboo-visible-top",`${viewport.offsetTop}px`);
  };
  update();
  viewport?.addEventListener("resize",update);
  viewport?.addEventListener("scroll",update);
  window.addEventListener("resize",update);
  return()=>{viewport?.removeEventListener("resize",update);viewport?.removeEventListener("scroll",update);window.removeEventListener("resize",update);root.style.removeProperty("--peakboo-visible-height");root.style.removeProperty("--peakboo-visible-top")};
 },[]);
}
