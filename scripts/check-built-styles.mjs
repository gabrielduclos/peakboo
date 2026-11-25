import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
for(const folder of ['dist','dist-portfolio']){
 const html=await readFile(new URL('../'+folder+'/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('<style data-peakboo-styles>'),folder+': embedded CSS missing');
 assert.ok(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html),folder+': external initial stylesheet');
 for(const selector of ['.chat-header','.avatar-photo','.chat-history','.conversation-panel','.calendar-page','.auth-modal','.notification-center','.push-settings','--peakboo-visible-height'])assert.ok(html.includes(selector),folder+': missing '+selector);
 const headers=await readFile(new URL('../'+folder+'/_headers',import.meta.url),'utf8');
 const policy=headers.split('\n').find(line=>line.trim().startsWith('Content-Security-Policy:'))||'';
 for(const directive of ["script-src 'self';","object-src 'none';","frame-ancestors 'none';","connect-src 'self' https://peakboo-api.onrender.com;"])assert.ok(policy.includes(directive),folder+': missing '+directive);
 assert.ok(!policy.includes("script-src 'self' 'unsafe-inline'"));
 assert.ok(!policy.includes("'unsafe-eval'"));
 const manifest=JSON.parse(await readFile(new URL('../'+folder+'/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.display,'standalone');
 for(const size of [180,192,512]){const png=await readFile(new URL('../'+folder+'/icon-'+size+'.png',import.meta.url));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
 const sw=await readFile(new URL('../'+folder+'/sw.js',import.meta.url),'utf8');assert.ok(sw.includes('notificationclick'));assert.ok(sw.includes('showNotification'));
 console.log(folder+': styling and installable PWA assets verified');
}
