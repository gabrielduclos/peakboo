import test from "node:test";
import assert from "node:assert/strict";
import {suggestChecklist,applyChecklistOperation} from "./checklists.mjs";
test("recognizes bullets, numbered and short multiline lists without changing ordinary messages",()=>{
 assert.deepEqual(suggestChecklist("Compras:\n- Arroz\n- Leite"),{title:"Compras",items:["Arroz","Leite"]});
 assert.deepEqual(suggestChecklist("1. Rice\n2. Milk"),{title:"",items:["Rice","Milk"]});
 assert.deepEqual(suggestChecklist("Arroz\nLeite\nCafé"),{title:"",items:["Arroz","Leite","Café"]});
 assert.equal(suggestChecklist("Olá!\nTudo bem?\nAté amanhã."),null);
 assert.equal(suggestChecklist("One ordinary message"),null);
 assert.equal(suggestChecklist("https://example.com\nRice\nMilk"),null);
 assert.equal(suggestChecklist(Array(51).fill("- Item").join("\n")),null);
});
test("item operations are explicit and idempotent; independent edits are preserved",()=>{
 const base={title:"List",version:1,items:[{id:"a",text:"Rice",done:false},{id:"b",text:"Milk",done:false}]};
 const checked=applyChecklistOperation(base,{kind:"toggle",id:"a",done:true});
 assert.equal(checked.version,2);
 assert.equal(applyChecklistOperation(checked,{kind:"toggle",id:"a",done:true}),checked);
 const edited=applyChecklistOperation(checked,{kind:"edit",id:"b",text:"Coffee"});
 assert.equal(edited.items[0].done,true);
 assert.equal(edited.items[1].text,"Coffee");
 const added=applyChecklistOperation(edited,{kind:"add",id:"c",text:"Eggs"});
 assert.equal(applyChecklistOperation(added,{kind:"add",id:"c",text:"Eggs"}),added);
 assert.equal(applyChecklistOperation(added,{kind:"remove",id:"b"}).items.length,2);
 assert.equal(applyChecklistOperation(added,{kind:"rename",title:"Groceries"}).title,"Groceries");
 assert.equal(base.items[0].done,false);
 assert.throws(()=>applyChecklistOperation(base,{kind:"edit",id:"missing",text:"No"}),/NOT_FOUND/);
 assert.throws(()=>applyChecklistOperation({...base,items:Array.from({length:50},(_,i)=>({id:String(i),text:"x",done:false}))},{kind:"add",id:"new",text:"x"}),/INVALID_INPUT/);
});
