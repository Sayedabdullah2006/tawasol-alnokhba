import {NextResponse} from 'next/server';
import {createServerSupabaseClient,createServiceRoleClient} from '@/lib/supabase-server';
import {verifyGuestMeetingURL} from '../../../../../supabase/functions/_shared/workforce-meeting-calendar';
import {meetingBrowserURL} from '@/lib/workforce/meetings';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,url=new URL(request.url),headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
 if(!await verifyGuestMeetingURL(id,url.searchParams.get('expires')||'',url.searchParams.get('token')||'',process.env.SUPABASE_SERVICE_ROLE_KEY||''))return new Response('رابط الاجتماع غير صالح أو انتهت صلاحيته',{status:404,headers});
 const service=await createServiceRoleClient(),result=await service.from('wf_meetings').select('id,status,ends_at,participant_ids,meet_url').eq('id',id).maybeSingle();
 if(result.error)return new Response('تعذر فتح الاجتماع؛ أعد المحاولة',{status:503,headers});
 const meeting=result.data;
 if(!meeting||meeting.status!=='scheduled'||Date.parse(meeting.ends_at)<Date.now())return new Response('الاجتماع ملغى أو انتهى موعده',{status:410,headers});
 // Staff using a forwarded guest link still enter through their authorized portal.
 // Only the normal POST join can protect attendance; this GET never changes it.
 const db=await createServerSupabaseClient(),{data:{user}}=await db.auth.getUser();
 if(user&&meeting.participant_ids.includes(user.id))return NextResponse.redirect(new URL(`/meetings/${id}`,'https://nukhba.media'),{headers});
 const destination=meetingBrowserURL(meeting.meet_url);
 if(!destination)return new Response('رابط الاجتماع غير متاح',{status:404,headers});
 return NextResponse.redirect(destination,{headers});
}
