// Cloudflare serves the built SPA and keeps the free Render API available for reminder processing.
export default {
 async fetch(request,env){
  const response=await env.ASSETS.fetch(request);
  const headers=new Headers(response.headers);
  // Asset-first requests use _headers; also protect responses served through this Worker.
  if(!headers.has("Content-Security-Policy"))headers.set("Content-Security-Policy","script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; frame-src https://www.google.com; manifest-src 'self'; connect-src 'self' https://pedrochat-api.onrender.com");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","no-referrer");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 },
 scheduled(_event,_env,ctx){ctx.waitUntil(fetch("https://pedrochat-api.onrender.com/api/health",{cache:"no-store"}).then(async r=>{await r.body?.cancel();if(!r.ok)throw Error("Peakboo health check failed")}))}
};
