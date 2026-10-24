import {CodeChallengeMethod} from 'google-auth-library';
import {cookies} from 'next/headers';import {randomBytes,createHash} from 'node:crypto';
import {workforceActor,requireAdmin,apiError} from '@/lib/workforce/server';
import {googleConnection,oauthMeetingClient} from '@/lib/workforce/meeting-server';
export async function GET(request:Request){try{
 const actor=await workforceActor();requireAdmin(actor);const c=await googleConnection(actor),client=oauthMeetingClient(c,request),state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
 (await cookies()).set('wf_google_meeting_oauth',JSON.stringify({state,verifier,user:actor.user.id}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/workforce/meetings/google',maxAge:600});
 return Response.redirect(client.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['openid','email','https://www.googleapis.com/auth/calendar.events.owned'],login_hint:c.expected_email,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:CodeChallengeMethod.S256}));
 }catch(e){return apiError(e);}}
