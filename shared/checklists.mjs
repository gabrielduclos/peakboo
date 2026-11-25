// Local, deterministic suggestion. Two or more nonempty lines, with or without markers.
export function suggestChecklist(text) {
  if(typeof text!=='string'||text.length>4000)return null;
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  let title='';
  if(lines[0]?.endsWith(':'))title=lines.shift().slice(0,-1).trim();
  if(lines.length<2||lines.length>50||title.length>80)return null;
  const marker=/^(?:[-*•]\s+|\d{1,3}[.)]\s+|\[[ xX]\]\s+)/u;
  const items=lines.map(s=>s.replace(marker,'').trim());
  if(items.some(s=>!s||s.length>200))return null;
  return {title,items};
}
export function applyChecklistOperation(list,op){
  const items=list.items;
  const existing=items.find(i=>i.id===op.id);
  if(op.kind==='add'){
    if(existing)return list;
    if(items.length>=50)throw Error('INVALID_INPUT');
    return {...list,version:list.version+1,items:[...items,{id:op.id,text:op.text,done:false}]};
  }
  if(op.kind==='rename')return list.title===op.title?list:{...list,title:op.title,version:list.version+1};
  if(!existing){if(op.kind==='remove')return list;throw Error('NOT_FOUND')}
  if(op.kind==='remove')return {...list,version:list.version+1,items:items.filter(i=>i.id!==op.id)};
  const value=op.kind==='toggle'?{done:op.done}:{text:op.text};
  if(Object.entries(value).every(([k,v])=>existing[k]===v))return list;
  return {...list,version:list.version+1,items:items.map(i=>i.id===op.id?{...i,...value}:i)};
}
