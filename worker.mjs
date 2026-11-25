// Cloudflare serves the built SPA and keeps the free Render API available for reminder processing.
export default {
 async fetch(request,env){
  const response=await env.ASSETS.fetch(request);
  const headers=new Headers(response.headers);
  // Asset-first requests use _headers; also protect responses served through this Worker.
  if(!headers.has("Content-Security-Policy"))headers.set("Content-Security-Policy","script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","no-referrer");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 },
 scheduled(_event,_env,ctx){ctx.waitUntil(fetch("https://peakboo-api.onrender.com/api/health",{cache:"no-store"}).then(async r=>{await r.body?.cancel();if(!r.ok)throw Error("Peakboo health check failed")}))}
};
