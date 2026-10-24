import {cookies} from 'next/headers';import {timingSafeEqual} from 'node:crypto';
import {workforceActor,requireAdmin,createServiceRoleClient} from '@/lib/workforce/server';
import {googleConnection,oauthMeetingClient,encryptMeetingSecret,meetingRoot,meetingOrigin} from '@/lib/workforce/meeting-server';
export async function GET(request:Request){const back=new URL('/admin/workforce/meetings',meetingOrigin(request));try{
 const jar=await cookies(),stored=jar.get('wf_google_meeting_oauth')?.value;jar.set('wf_google_meeting_oauth','',{path:'/api/workforce/meetings/google',maxAge:0,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'});
 const actor=await workforceActor();requireAdmin(actor);const params=new URL(request.url).searchParams,check=JSON.parse(stored||'null'),state=params.get('state');
 if(!check||check.user!==actor.user.id||!state||Buffer.byteLength(state)!==Buffer.byteLength(check.state)||!timingSafeEqual(Buffer.from(state),Buffer.from(check.state))||!params.get('code'))throw Error();
 const c=await googleConnection(actor),client=oauthMeetingClient(c,request),{tokens}=await client.getToken({code:params.get('code')!,codeVerifier:check.verifier});
 if(!tokens.id_token||!tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/calendar.events.owned'))throw Error();const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:c.client_id!}),identity=ticket.getPayload();
 if(!identity?.email_verified||identity.email?.toLowerCase()!==c.expected_email.toLowerCase()||!tokens.refresh_token)throw Error();
 const saved=await (await createServiceRoleClient()).rpc('wf_meeting_google',{p_actor:actor.user.id,p_command:'connect',p_payload:{email:identity.email,subject:identity.sub,refresh_token_cipher:encryptMeetingSecret(tokens.refresh_token,meetingRoot())}});if(saved.error)throw saved.error;back.searchParams.set('google','connected');
 }catch{back.searchParams.set('google','failed');}return Response.redirect(back);}
