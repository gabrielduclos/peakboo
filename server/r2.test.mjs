import {test} from "node:test";
import assert from "node:assert/strict";
import {r2Config,mediaKey,signedRequest,createR2,mediaBytes} from "./r2.mjs";
const env={R2_ACCOUNT_ID:"a".repeat(32),R2_BUCKET:"peakboo-media",R2_ACCESS_KEY_ID:"test-id",R2_SECRET_ACCESS_KEY:"test-secret"};
const config=r2Config(env),key=mediaKey("11111111-1111-1111-1111-111111111111");
test("R2 configuration is explicit and credentials stay in signed headers",()=>{
 assert.equal(r2Config({}),null);assert.throws(()=>r2Config({R2_BUCKET:"peakboo-media"}));
 const {url,options}=signedRequest(config,"PUT",key,Buffer.from("abc"),"text/plain",new Date("2026-11-24T12:34:56Z"));
 assert.equal(url,"https://"+"a".repeat(32)+".r2.cloudflarestorage.com/peakboo-media/"+key);
 assert.equal(options.headers["x-amz-date"],"20261124T123456Z");
 assert.equal(options.headers["x-amz-content-sha256"],"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
 assert.match(options.headers.authorization,/Credential=test-id\/20261124\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
 assert.ok(!JSON.stringify(options.headers).includes("test-secret"));
});
test("R2 storage preserves bytes, supports removal and falls back only to retained originals",async()=>{
 let stored;const storage=createR2(config,async(_url,opts)=>{if(opts.method==="PUT"){stored=Buffer.from(opts.body);return new Response(null,{status:200})}if(opts.method==="DELETE"){stored=null;return new Response(null,{status:204})}return stored?new Response(stored):new Response(null,{status:404})});
 const original=Buffer.from("private test");
 await storage.put(key,original,"text/plain");assert.deepEqual(await mediaBytes({r2_key:key},storage),original);
 await storage.delete(key);assert.deepEqual(await mediaBytes({r2_key:key,bytes:original},storage),original);
 await assert.rejects(mediaBytes({r2_key:key},storage));assert.deepEqual(await mediaBytes({bytes:original},null),original);
});
