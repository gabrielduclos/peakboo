/* No private data or API response is cached by this worker. */
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
self.addEventListener("push",event=>{
 let n={};try{n=event.data?.json()||{}}catch{}
 const roomId=uuid.test(n.roomId||"")?n.roomId:null,eventId=uuid.test(n.eventId||"")?n.eventId:null;
 const target=new URL("/",self.location.origin);
 if(roomId)target.hash=new URLSearchParams({pushRoom:roomId,...(eventId?{pushEvent:eventId}:{})}).toString();
 event.waitUntil(self.registration.showNotification(String(n.title||"Peakboo").slice(0,100),{
  body:String(n.body||"Peakboo").slice(0,240),icon:"/peakboo-192-v2.png",badge:"/peakboo-badge-v2.png",tag:roomId?"peakboo-"+(eventId||roomId):"peakboo",data:{url:target.href},renotify:true
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let target;try{target=new URL(event.notification.data?.url||"/",self.location.origin)}catch{target=new URL("/",self.location.origin)}
  if(target.origin!==self.location.origin)target=new URL("/",self.location.origin);
  const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  const client=clients.find(c=>new URL(c.url).origin===self.location.origin);
  if(client){await client.focus();client.postMessage({type:"PEAKBOO_PUSH_OPEN",hash:target.hash});return}
  await self.clients.openWindow(target.href);
 })());
});
self.addEventListener("fetch",event=>{
 if(event.request.mode!=="navigate"||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peakboo</title><body style="font-family:system-ui;text-align:center;padding:40px"><h1>Peakboo</h1><p>Sem conexão / Offline</p><a href="/">Tentar novamente / Retry</a></body></html>',{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})));
});
