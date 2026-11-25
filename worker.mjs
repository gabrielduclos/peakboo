// Cloudflare serves the built SPA and keeps the free Render API available for reminder processing.
export default {
 fetch(request,env){return env.ASSETS.fetch(request)},
 scheduled(_event,_env,ctx){ctx.waitUntil(fetch("https://peakboo-api.onrender.com/api/health",{cache:"no-store"}).then(async r=>{await r.body?.cancel();if(!r.ok)throw Error("Peakboo health check failed")}))}
};
