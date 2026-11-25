import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.mjs";
import {readFile} from "node:fs/promises";
const policy="script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; frame-src https://www.google.com; manifest-src 'self'; connect-src 'self' https://peakboo-api.onrender.com";
test("static assets and Worker fallback share a strict script policy",async()=>{
 const config=await readFile(new URL("../public/_headers",import.meta.url),"utf8");
 assert.ok(config.includes("Content-Security-Policy: "+policy));
 assert.ok(!policy.includes("\'unsafe-eval\'"));
 assert.ok(policy.includes("frame-ancestors \'none\'"));
 const env={ASSETS:{fetch:async()=>new Response("page",{headers:{"Cache-Control":"no-cache","Content-Type":"text/html"}})}};
 const response=await worker.fetch(new Request("https://example.invalid/"),env);
 assert.equal(response.headers.get("Content-Security-Policy"),policy);
 assert.equal(response.headers.get("X-Content-Type-Options"),"nosniff");
 assert.equal(response.headers.get("Referrer-Policy"),"no-referrer");
 assert.equal(response.headers.get("Cache-Control"),"no-cache");
 assert.equal(await response.text(),"page");
});
test("Worker does not overwrite a more specific asset policy",async()=>{
 const response=await worker.fetch(new Request("https://example.invalid/"),{ASSETS:{fetch:async()=>new Response(null,{status:304,headers:{"Content-Security-Policy":"default-src 'none'"}})}});
 assert.equal(response.status,304);assert.equal(response.headers.get("Content-Security-Policy"),"default-src 'none'");
});
