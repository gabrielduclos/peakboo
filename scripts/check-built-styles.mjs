import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
for(const folder of ['dist','dist-portfolio']){
 const html=await readFile(new URL('../'+folder+'/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('<style data-peakboo-styles>'),folder+': embedded CSS missing');
 assert.ok(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html),folder+': external initial stylesheet');
 for(const selector of ['.chat-header','.avatar-photo','.chat-history','.conversation-panel','.calendar-page','.auth-modal','.notification-center','.push-settings','--peakboo-visible-height'])assert.ok(html.includes(selector),folder+': missing '+selector);
 const headers=await readFile(new URL('../'+folder+'/_headers',import.meta.url),'utf8');
 assert.ok(headers.includes("Content-Security-Policy: script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'"),folder+': script policy missing');
 assert.ok(headers.includes('X-Content-Type-Options: nosniff'));
 assert.ok(!/<script\\b(?![^>]*\\bsrc=)[^>]*>/i.test(html),folder+': inline script conflicts with CSP');
 const manifest=JSON.parse(await readFile(new URL('../'+folder+'/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.display,'standalone');
 for(const size of [180,192,512]){const png=await readFile(new URL('../'+folder+'/icon-'+size+'.png',import.meta.url));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
 const sw=await readFile(new URL('../'+folder+'/sw.js',import.meta.url),'utf8');assert.ok(sw.includes('notificationclick'));assert.ok(sw.includes('showNotification'));
 console.log(folder+': styling and installable PWA assets verified');
}
