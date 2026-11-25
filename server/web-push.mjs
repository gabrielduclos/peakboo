import {createECDH,createPrivateKey,createCipheriv,hkdfSync,randomBytes,sign,ECDH} from "node:crypto";
const b64=b=>Buffer.from(b).toString("base64url");
const hk=(ikm,salt,info,len)=>Buffer.from(hkdfSync("sha256",ikm,salt,info,len));
const bytes=(s,len)=>{if(typeof s!=="string"||! /^[A-Za-z0-9_-]+$/.test(s))throw Error("Invalid key");const b=Buffer.from(s,"base64url");if(b.length!==len||b64(b)!==s)throw Error("Invalid key");return b};
export function validateSubscription(data){
 const url=new URL(data.endpoint);
 const host=url.hostname;
 if(url.protocol!=="https:"||url.port||url.username||url.password||url.hash||url.href.length>2048||!["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"].includes(host)&&!host.endsWith(".push.apple.com")&&!host.endsWith(".notify.windows.com")&&!host.endsWith(".wns.windows.com"))throw Error("Invalid endpoint");
 const p=bytes(data.keys?.p256dh,65),auth=bytes(data.keys?.auth,16);
 if(p[0]!==4)throw Error("Invalid key");
 ECDH.convertKey(p,"prime256v1",undefined,undefined,"uncompressed");
 return {endpoint:url.href,keys:{p256dh:b64(p),auth:b64(auth)}};
}
export function vapidKeys(env=process.env){
 if(env.PUSH_ENABLED!=="true")return null;
 const e=createECDH("prime256v1");
 if(env.PUSH_VAPID_PRIVATE_KEY)e.setPrivateKey(bytes(env.PUSH_VAPID_PRIVATE_KEY,32));
 else{
  if(!env.BETTER_AUTH_SECRET)throw Error("Missing VAPID secret");
  for(let i=0;;i++){try{e.setPrivateKey(hk(Buffer.from(env.BETTER_AUTH_SECRET),Buffer.from("peakboo-vapid-v1"),Buffer.from("signing-key:"+i),32));break}catch{if(i>10)throw Error("Invalid VAPID key")}}
 }
 const pub=e.getPublicKey();
 return {publicKey:b64(pub),privateKey:createPrivateKey({key:{kty:"EC",crv:"P-256",x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33)),d:b64(Buffer.concat([Buffer.alloc(32-e.getPrivateKey().length),e.getPrivateKey()]))},format:"jwk"}),subject:env.PUSH_VAPID_SUBJECT||"https://main.peakboo.workers.dev"};
}
export function encryptPayload(subscription,payload,{salt=randomBytes(16),keyPair}={}){
 const receiver=bytes(subscription.keys.p256dh,65),auth=bytes(subscription.keys.auth,16);
 const sender=keyPair||createECDH("prime256v1");if(!keyPair)sender.generateKeys();
 const publicKey=sender.getPublicKey(),secret=sender.computeSecret(receiver);
 const ikm=hk(secret,auth,Buffer.concat([Buffer.from("WebPush: info\0"),receiver,publicKey]),32);
 const cek=hk(ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16),nonce=hk(ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12);
 const plain=Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from([2])]);
 if(plain.length+16>3993)throw Error("Push payload too large");
 const cipher=createCipheriv("aes-128-gcm",cek,nonce),encoded=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 const header=Buffer.alloc(21);salt.copy(header);header.writeUInt32BE(4096,16);header[20]=publicKey.length;
 return Buffer.concat([header,publicKey,encoded]);
}
export function authorization(keys,endpoint,now=Date.now()){
 const prefix=b64(JSON.stringify({typ:"JWT",alg:"ES256"}))+"."+b64(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+3600,sub:keys.subject}));
 const signature=sign("sha256",Buffer.from(prefix),{key:keys.privateKey,dsaEncoding:"ieee-p1363"});
 return "vapid t="+prefix+"."+b64(signature)+", k="+keys.publicKey;
}
export async function sendWebPush(keys,subscription,payload,fetcher=fetch){
 const sub=validateSubscription(subscription),body=encryptPayload(sub,payload);
 const result=await fetcher(sub.endpoint,{method:"POST",headers:{Authorization:authorization(keys,sub.endpoint),"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream",TTL:"300",Urgency:"normal"},body,redirect:"error",signal:AbortSignal.timeout(10000)});
 await result.body?.cancel();
 return result.status;
}
