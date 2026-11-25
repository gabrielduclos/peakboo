export type ChecklistItem={id:string;text:string;done:boolean};
export type Checklist={title:string;items:ChecklistItem[];version:number};
export type ChecklistOperation={kind:'add'|'edit';id:string;text:string}|{kind:'toggle';id:string;done:boolean}|{kind:'remove';id:string}|{kind:'rename';title:string};
export function suggestChecklist(text:string):{title:string;items:string[]}|null;
export function applyChecklistOperation(list:Checklist,op:ChecklistOperation):Checklist;
