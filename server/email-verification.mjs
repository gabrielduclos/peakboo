// Transactional email is sent only from the backend. Never log verification URLs or tokens.
export function emailVerificationConfig(env=process.env) {
  const enabled=env.EMAIL_VERIFICATION_REQUIRED==="true";
  const key=env.RESEND_API_KEY?.trim();
  const from=env.RESEND_FROM_EMAIL?.trim();
  if(enabled&&(!key||!from))throw new Error("Email verification requires RESEND_API_KEY and RESEND_FROM_EMAIL");
  return {enabled,key,from};
}

export function createVerificationSender(config,fetcher=fetch){
  return async ({user,url})=>{
    const link=new URL(url);
    if(link.protocol!=="https:"&&!(link.protocol==="http:"&&["localhost","127.0.0.1"].includes(link.hostname)))throw new Error("Invalid verification URL");
    const response=await fetcher("https://api.resend.com/emails",{
      method:"POST",
      headers:{Authorization:"Bearer "+config.key,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:config.from,to:[user.email],
        subject:"Peakboo | Confirme seu e-mail / Verify your email",
        text:"Confirme seu endereço de e-mail para acessar o Peakboo.\n"+link.href+"\nO link expira em 1 hora. Ignore se você não solicitou.\n\nVerify your email to access Peakboo.\n"+link.href+"\nThe link expires in 1 hour. Ignore if you did not request this."
      }),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok){await response.body?.cancel();throw new Error("Email delivery failed");}
    await response.body?.cancel();
  };
}
