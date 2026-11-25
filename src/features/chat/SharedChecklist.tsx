import {useRef,useState,type FormEvent} from "react";
import {ListChecks,Pencil,Plus,Trash2,LoaderCircle} from "lucide-react";
import {Button,Modal} from "../../components";
import type {Message} from "../../types";
import type {Checklist,ChecklistOperation} from "../../../shared/checklists.mjs";
export type ListDraft={id:string;title:string;items:string[];source?:Message};
export function ChecklistDialog({pt,initial,onClose,onSave}:{pt:boolean;initial?:{title:string;items:string[];source?:Message};onClose:()=>void;onSave:(draft:ListDraft)=>Promise<void>}){
 const [title,setTitle]=useState(initial?.title||(pt?"Lista":"List"));
 const [items,setItems]=useState(initial?.items.join("\n")||"");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef(false),id=useRef(crypto.randomUUID());
 async function save(e:FormEvent){e.preventDefault();if(pending.current)return;
  const values=items.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!title.trim()||title.trim().length>80||values.length<1||values.length>50||values.some(x=>x.length>200)){setError(pt?"Informe um título e de 1 a 50 itens (até 200 caracteres cada).":"Enter a title and 1–50 items (up to 200 characters each).");return}
  pending.current=true;setBusy(true);setError("");
  try{await onSave({id:id.current,title:title.trim(),items:values,source:initial?.source});onClose()}catch{setError(pt?"Não foi possível criar a lista. Tente novamente.":"Could not create list. Try again.")}finally{pending.current=false;setBusy(false)}
 }
 return <Modal open onOpenChange={v=>{if(!v&&!pending.current)onClose()}} title={pt?"Criar lista":"Create list"} closeLabel={pt?"Fechar":"Close"} className="shared-list-dialog">
  <form className="form" onSubmit={save}>
   <label>{pt?"Título":"Title"}<input required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label>
   <label>{pt?"Itens (um por linha)":"Items (one per line)"}<textarea required rows={6} maxLength={10100} value={items} onChange={e=>setItems(e.target.value)} disabled={busy} placeholder={pt?"Arroz\nLeite\nCafé":"Rice\nMilk\nCoffee"}/></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{pt?"Cancelar":"Cancel"}</Button><Button busy={busy}>{pt?"Criar lista":"Create list"}</Button></div>
  </form>
 </Modal>
}
export function SharedChecklist({list,pt,onChange}:{list:Checklist;pt:boolean;onChange:(op:ChecklistOperation)=>Promise<void>}){
 const [newItem,setNewItem]=useState(""),[editing,setEditing]=useState<string|null>(null),[editText,setEditText]=useState("");
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 const pending=useRef(false),addId=useRef<string|null>(null);
 async function run(key:string,op:ChecklistOperation,success?:()=>void){
  if(pending.current)return;pending.current=true;setBusy(key);setError("");
  try{await onChange(op);success?.()}catch{setError(pt?"Não foi possível atualizar a lista. Tente novamente.":"Could not update list. Try again.")}finally{pending.current=false;setBusy(null)}
 }
 const complete=list.items.filter(i=>i.done).length;
 return <div className="shared-checklist" data-no-swipe onContextMenu={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
  <div className="shared-list-heading"><ListChecks size={18}/><strong>{list.title}</strong><small>{complete}/{list.items.length}</small><button type="button" className="icon-button tiny" disabled={!!busy} aria-label={pt?"Renomear lista":"Rename list"} onClick={()=>{setEditing("title");setEditText(list.title)}}><Pencil size={15}/></button></div>
  <progress max={Math.max(1,list.items.length)} value={complete} aria-label={pt?"Progresso da lista":"List progress"}/>
  {editing==="title"&&<form className="shared-list-edit" onSubmit={e=>{e.preventDefault();if(editText.trim())void run("title",{kind:"rename",title:editText.trim()},()=>setEditing(null))}}><input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={80} required aria-label={pt?"Título":"Title"}/><Button busy={busy==="title"} disabled={!!busy}>{pt?"Salvar":"Save"}</Button><Button type="button" variant="ghost" disabled={!!busy} onClick={()=>setEditing(null)}>{pt?"Cancelar":"Cancel"}</Button></form>}
  {list.items.map(i=><div className="shared-list-item" key={i.id}>
   {editing===i.id?<form className="shared-list-edit" onSubmit={e=>{e.preventDefault();if(editText.trim())void run(i.id,{kind:"edit",id:i.id,text:editText.trim()},()=>setEditing(null))}}><input required maxLength={200} value={editText} onChange={e=>setEditText(e.target.value)} aria-label={pt?"Editar item":"Edit item"}/><Button busy={busy===i.id} disabled={!!busy}>{pt?"Salvar":"Save"}</Button><Button type="button" variant="ghost" disabled={!!busy} onClick={()=>setEditing(null)}>{pt?"Cancelar":"Cancel"}</Button></form>:<>
    <label className={i.done?"done":""}><input type="checkbox" checked={i.done} disabled={!!busy} onChange={e=>void run(i.id,{kind:"toggle",id:i.id,done:e.target.checked})}/><span>{i.text}</span></label>
    {busy===i.id?<LoaderCircle size={16} className="spin" aria-label={pt?"Atualizando":"Updating"}/>:<><button type="button" className="icon-button tiny" aria-label={pt?"Editar item":"Edit item"} disabled={!!busy} onClick={()=>{setEditing(i.id);setEditText(i.text)}}><Pencil size={15}/></button><button type="button" className="icon-button tiny" aria-label={pt?"Excluir item":"Delete item"} disabled={!!busy} onClick={()=>void run(i.id,{kind:"remove",id:i.id})}><Trash2 size={15}/></button></>}
   </>}
  </div>)}
  {list.items.length<50&&<form className="shared-list-add" onSubmit={e=>{e.preventDefault();if(!newItem.trim())return;addId.current??=crypto.randomUUID();void run("add",{kind:"add",id:addId.current,text:newItem.trim()},()=>{setNewItem("");addId.current=null})}}><input value={newItem} onChange={e=>{setNewItem(e.target.value);addId.current=null}} maxLength={200} placeholder={pt?"Adicionar item":"Add item"} aria-label={pt?"Adicionar item":"Add item"} disabled={!!busy}/><Button busy={busy==="add"} disabled={!!busy||!newItem.trim()} type="submit" aria-label={pt?"Adicionar":"Add"}><Plus size={17}/></Button></form>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </div>
}
