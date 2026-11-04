// Private PHP/Node pipe transport only. Never invoke this from a public URL or log stdout.
import {createFirst1SsoClient} from './oidc-client.mjs'
try {
 let raw=''
 for await(const chunk of process.stdin){raw+=chunk;if(raw.length>65536)throw Error('BODY_TOO_LARGE')}
 const body=JSON.parse(raw),client=await createFirst1SsoClient({issuer:process.env.FIRST1SAUDI_OIDC_ISSUER,clientId:process.env.FIRST1SAUDI_OIDC_CLIENT_ID,clientSecret:process.env.FIRST1SAUDI_OIDC_CLIENT_SECRET,redirectUri:process.env.FIRST1SAUDI_OIDC_REDIRECT_URI})
 let result
 if(body.command==='begin')result=await client.begin({forceLogin:body.force_login===true,screen:body.screen==='register'?'register':'login'})
 else if(body.command==='finish')result=await client.finish(body.callback_url,body.transaction)
 else if(body.command==='refresh')result=await client.refresh(body.refresh_token,body.subject)
 else throw Error('INVALID_COMMAND')
 process.stdout.write(JSON.stringify({ok:true,result}))
}catch{process.stdout.write(JSON.stringify({ok:false,error:'SSO_UNAVAILABLE'}));process.exitCode=1}
