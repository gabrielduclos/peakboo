import test from "node:test";
import assert from "node:assert/strict";
import {emailVerificationConfig,createVerificationSender} from "./email-verification.mjs";

test("verification is opt-in and refuses incomplete configuration",()=>{
 assert.equal(emailVerificationConfig({}).enabled,false);
 assert.throws(()=>emailVerificationConfig({EMAIL_VERIFICATION_REQUIRED:"true"}),/requires/);
 assert.equal(emailVerificationConfig({EMAIL_VERIFICATION_REQUIRED:"true",RESEND_API_KEY:"fake",RESEND_FROM_EMAIL:"Peakboo <no-reply@example.com>"}).enabled,true);
});
test("sender uses Resend with a verification link and no password",async()=>{
 let sent;
 const send=createVerificationSender({key:"fake",from:"Peakboo <no-reply@example.com>"},async(url,opts)=>{sent={url,opts};return new Response(null,{status:200})});
 await send({user:{email:"test@example.com"},url:"https://api.example.com/api/auth/verify-email?token=fake"});
 assert.equal(sent.url,"https://api.resend.com/emails");
 assert.equal(sent.opts.headers.Authorization,"Bearer fake");
 const body=JSON.parse(sent.opts.body);
 assert.deepEqual(body.to,["test@example.com"]);
 assert.match(body.text,/verify-email\?token=fake/);
 assert.equal(body.password,undefined);
});
test("delivery failure is generic and unsafe links never sent",async()=>{
 const send=createVerificationSender({key:"fake",from:"sender@example.com"},async()=>new Response("private error",{status:429}));
 await assert.rejects(send({user:{email:"test@example.com"},url:"https://api.example.com/verify"}),/Email delivery failed/);
 await assert.rejects(send({user:{email:"test@example.com"},url:"http://evil.example/verify"}),/Invalid verification URL/);
});
