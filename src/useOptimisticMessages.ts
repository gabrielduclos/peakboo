import {useEffect,useRef,useState} from 'react';
import type {Message} from './types';
export type PendingMessage=Message&{roomId:string};
export function mergeMessages(confirmed:Message[],pending:Message[]){const ids=new Set(confirmed.map(m=>m.id));return [...confirmed,...pending.filter(m=>!ids.has(m.id))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export function useOptimisticMessages(account:string){
 const [pending,setPending]=useState<PendingMessage[]>([]);const files=useRef(new Map<string,File>()),uploads=useRef(new Map<string,string>()),urls=useRef(new Map<string,string>());
 function dispose(id:string){files.current.delete(id);uploads.current.delete(id);const url=urls.current.get(id);if(url){URL.revokeObjectURL(url);urls.current.delete(id)}}
 useEffect(()=>{setPending([]);for(const id of urls.current.keys())dispose(id);files.current.clear();uploads.current.clear();return()=>{for(const id of urls.current.keys())dispose(id)}},[account]);
 function add(m:PendingMessage,file?:File){if(file)files.current.set(m.id,file);if(m.attachment?.url?.startsWith('blob:'))urls.current.set(m.id,m.attachment.url);setPending(old=>[...old,m])}
 function status(id:string,pendingStatus:'sending'|'failed'){setPending(old=>old.map(m=>m.id===id?{...m,pendingStatus}:m))}
 function remove(id:string){setPending(old=>old.filter(m=>m.id!==id));dispose(id)}
 return {pending,files,uploads,add,status,remove};
}
