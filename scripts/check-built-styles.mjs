import {createHash} from "node:crypto";
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
for(const folder of ['dist','dist-portfolio']){
 const html=await readFile(new URL('../'+folder+'/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('<style data-peakboo-styles>'),folder+': embedded CSS missing');
 assert.ok(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html),folder+': external initial stylesheet');
 for(const selector of ['.chat-header','.avatar-photo','.chat-history','.conversation-panel','.calendar-page','.auth-modal','.notification-center','.push-settings','--peakboo-visible-height'])assert.ok(html.includes(selector),folder+': missing '+selector);
 const headers=await readFile(new URL('../'+folder+'/_headers',import.meta.url),'utf8');
 assert.ok(headers.includes("Content-Security-Policy: script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; frame-src https://www.google.com; manifest-src 'self'; connect-src 'self' https://peakboo-api.onrender.com"),folder+': script policy missing');
 assert.ok(headers.includes('X-Content-Type-Options: nosniff'));
 assert.ok(!/<script\\b(?![^>]*\\bsrc=)[^>]*>/i.test(html),folder+': inline script conflicts with CSP');
 const manifest=JSON.parse(await readFile(new URL('../'+folder+'/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.display,'standalone');
 for(const size of [180,192,512]){const png=await readFile(new URL('../'+folder+'/icon-'+size+'.png',import.meta.url));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
 const sw=await readFile(new URL('../'+folder+'/sw.js',import.meta.url),'utf8');assert.ok(sw.includes('notificationclick'));assert.ok(sw.includes('showNotification'));
 assert.equal(manifest.id,'/');
 assert.equal(manifest.start_url,'/');
 const verifyIcon=async(url,size)=>{
  assert.match(url,/^\/pwa\/peakboo-[a-z0-9-]+-[0-9a-f]{16}\.png$/);
  const png=await readFile(new URL('../'+folder+url,import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
  assert.ok(url.endsWith(createHash('sha256').update(png).digest('hex').slice(0,16)+'.png'));
  return png;
 };
 assert.equal(manifest.icons.length,3);
 for(const icon of manifest.icons)await verifyIcon(icon.src,Number(icon.sizes.split('x')[0]));
 assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'&&icon.sizes==='512x512'));
 const favicon=html.match(/href="(\/pwa\/peakboo-32-[0-9a-f]{16}\.png)"/)?.[1];
 const apple=html.match(/href="(\/pwa\/peakboo-180-[0-9a-f]{16}\.png)"/)?.[1];
 await verifyIcon(favicon,32);await verifyIcon(apple,180);
 const badge=sw.match(/badge:"([^"]+)"/)?.[1];
 const badgePng=await verifyIcon(badge,96);
 assert.ok(badgePng.includes(Buffer.from('tRNS'))||[4,6].includes(badgePng[25]),'badge must support transparency');
 assert.ok(sw.includes('icon:"'+manifest.icons.find(i=>i.sizes==='192x192').src+'"'));
 assert.ok(headers.includes('/pwa/*\n  Cache-Control: public, max-age=31536000, immutable'));
 console.log(folder+': styling and installable PWA assets verified');
}
