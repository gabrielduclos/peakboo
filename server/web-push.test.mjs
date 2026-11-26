import {test} from "node:test";
import assert from "node:assert/strict";
import {createECDH,createDecipheriv,createPublicKey,hkdfSync,verify,randomBytes} from "node:crypto";
import {validateSubscription,vapidKeys,encryptPayload,authorization,sendWebPush} from "./web-push.mjs";
const receiver=createECDH("prime256v1");receiver.generateKeys();
const sub={endpoint:"https://fcm.googleapis.com/fcm/send/example",keys:{p256dh:receiver.getPublicKey().toString("base64url"),auth:randomBytes(16).toString("base64url")}};
const keys=vapidKeys({PUSH_ENABLED:"true",BETTER_AUTH_SECRET:"test-secret"});
test("push subscription rejects private networks, redirects, invalid keys and non-provider origins",()=>{
 for(const endpoint of ["http://fcm.googleapis.com/test","https://localhost/test","https://127.0.0.1/test","https://fcm.googleapis.com.evil.test/test","https://fcm.googleapis.com:123/test"])assert.throws(()=>validateSubscription({...sub,endpoint}));
 assert.deepEqual(validateSubscription(sub),sub);assert.throws(()=>validateSubscription({...sub,keys:{...sub.keys,auth:"bad"}}));
});
test("RFC8291 payload can be decrypted by subscription receiver",()=>{
 const payload={title:"BabyChat",body:"Mensagem privada"},encoded=encryptPayload(sub,payload),salt=encoded.subarray(0,16),pub=encoded.subarray(21,86),cipher=encoded.subarray(86);
 const hk=(ikm,salt,info,len)=>Buffer.from(hkdfSync("sha256",ikm,salt,info,len));
 const ikm=hk(receiver.computeSecret(pub),Buffer.from(sub.keys.auth,"base64url"),Buffer.concat([Buffer.from("WebPush: info\0"),receiver.getPublicKey(),pub]),32);
 const dec=createDecipheriv("aes-128-gcm",hk(ikm,salt,"Content-Encoding: aes128gcm\0",16),hk(ikm,salt,"Content-Encoding: nonce\0",12));dec.setAuthTag(cipher.subarray(-16));
 const plain=Buffer.concat([dec.update(cipher.subarray(0,-16)),dec.final()]);assert.equal(plain.at(-1),2);assert.deepEqual(JSON.parse(plain.subarray(0,-1)),payload);
});
test("VAPID JWT is stable in key, valid in signature and scoped to push origin",()=>{
 assert.equal(keys.publicKey,vapidKeys({PUSH_ENABLED:"true",BETTER_AUTH_SECRET:"test-secret"}).publicKey);
 const value=authorization(keys,sub.endpoint),jwt=value.split("t=")[1].split(",")[0],parts=jwt.split(".");
 assert.equal(JSON.parse(Buffer.from(parts[1],"base64url")).aud,"https://fcm.googleapis.com");
 assert.ok(verify("sha256",Buffer.from(parts.slice(0,2).join(".")),{key:createPublicKey(keys.privateKey),dsaEncoding:"ieee-p1363"},Buffer.from(parts[2],"base64url")));
});
test("push transport never follows redirects and sends encrypted data",async()=>{
 const status=await sendWebPush(keys,sub,{title:"BabyChat",body:"secret"},async(url,opts)=>{assert.equal(url,sub.endpoint);assert.equal(opts.redirect,"error");assert.equal(opts.headers["Content-Encoding"],"aes128gcm");assert.equal(opts.body.includes(Buffer.from("secret")),false);return new Response(null,{status:201})});assert.equal(status,201)
});
