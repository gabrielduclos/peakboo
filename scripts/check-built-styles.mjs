import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
for(const folder of ['dist','dist-portfolio']){
 const html=await readFile(new URL('../'+folder+'/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('<style data-peakboo-styles>'),folder+': embedded CSS missing');
 assert.ok(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html),folder+': external initial stylesheet');
 for(const selector of ['.chat-header','.avatar-photo','.chat-history'])assert.ok(html.includes(selector),folder+': missing '+selector);
 console.log(folder+': styling delivered inside HTML');
}
