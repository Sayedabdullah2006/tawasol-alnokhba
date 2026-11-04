// Server-only reference. Requires Node >=22 and openid-client@6.8.9.
// Never send transaction, tokens, or clientSecret to the browser or logs.
import * as oidc from 'openid-client'

export async function createFirst1SsoClient({issuer,clientId,clientSecret,redirectUri}) {
  const expectedIssuer=new URL(issuer),redirect=new URL(redirectUri)
  if(expectedIssuer.protocol!=='https:'||redirect.href!=='https://first1saudi.net/services/auth/callback')throw Error('INVALID_OIDC_CONFIGURATION')
  const config=await oidc.discovery(expectedIssuer,clientId,{client_secret:clientSecret,token_endpoint_auth_method:'client_secret_post',id_token_signed_response_alg:'ES256'},oidc.ClientSecretPost(clientSecret))
  oidc.enableNonRepudiationChecks(config)
  async function identity(tokens,subject){
    const claims=tokens.claims(),sub=subject??claims?.sub
    if(!sub||(claims&&claims.sub!==sub))throw Error('INVALID_SUBJECT')
    const info=await oidc.fetchUserInfo(config,tokens.access_token,sub)
    if(info.email_verified!==true||typeof info.email!=='string')throw Error('EMAIL_NOT_VERIFIED')
    return {identity:{issuer:config.serverMetadata().issuer,subject:sub,email:info.email,email_verified:true,name:info.name??''},tokens}
  }
  return {
    async begin({forceLogin=false,screen='login'}={}){
      const verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce()
      const transaction={state,nonce,code_verifier:verifier,created_at:Date.now(),used:false}
      const url=oidc.buildAuthorizationUrl(config,{response_type:'code',redirect_uri:redirect.href,scope:'openid email profile offline_access',state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'})
      if(forceLogin||screen==='register'){
        // Create a validated provider request first, then choose the provider's hosted login UI.
        const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)})
        if(response.status!==302)throw Error('AUTHORIZATION_START_FAILED')
        const hosted=new URL(response.headers.get('location'))
        const id=hosted.searchParams.get('authorization_id')
        if(hosted.origin+hosted.pathname!=='https://nukhba.media/oauth/consent'||!id||!/^[A-Za-z0-9_-]{16,128}$/.test(id))throw Error('INVALID_AUTHORIZATION_START')
        hosted.pathname='/auth/sso'
        if(screen==='register')hosted.searchParams.set('mode','register')
        return {authorization_url:hosted.href,transaction}
      }
      return {authorization_url:url.href,transaction}
    },
    async finish(callbackUrl,transaction){
      if(!transaction||transaction.used||!Number.isFinite(transaction.created_at)||Date.now()-transaction.created_at>300000||transaction.created_at>Date.now())throw Error('TRANSACTION_EXPIRED')
      const url=new URL(callbackUrl)
      if(url.origin+url.pathname!==redirect.origin+redirect.pathname||url.username||url.password||url.hash)throw Error('INVALID_CALLBACK')
      // The relying party must atomically consume its stored transaction before calling finish.
      transaction.used=true
      const tokens=await oidc.authorizationCodeGrant(config,url,{pkceCodeVerifier:transaction.code_verifier,expectedState:transaction.state,expectedNonce:transaction.nonce,idTokenExpected:true},{client_id:clientId})
      return identity(tokens)
    },
    async refresh(refreshToken,subject){return identity(await oidc.refreshTokenGrant(config,refreshToken,{client_id:clientId}),subject)},
  }
}
