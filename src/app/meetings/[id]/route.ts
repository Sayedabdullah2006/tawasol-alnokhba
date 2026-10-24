import {NextResponse} from 'next/server';
import {createServerSupabaseClient} from '@/lib/supabase-server';
import {meetingEntryPath,meetingPortalPath} from '@/lib/workforce/meeting-entry';
import {meetingOrigin} from '@/lib/workforce/meeting-server';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,headers={'Cache-Control':'private, no-store'},origin=meetingOrigin(request);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return new Response('الاجتماع غير متاح',{status:404,headers});
 const db=await createServerSupabaseClient(),{data:{user},error}=await db.auth.getUser();
 // A link visit never joins, renews attendance or sends a notification.
 if(error||!user){const url=new URL('/auth/login',origin);url.searchParams.set('next',meetingEntryPath(id));return NextResponse.redirect(url,{headers});}
 const profile=await db.from('profiles').select('role').eq('id',user.id).single();
 if(!profile.data||!['admin','employee'].includes(profile.data.role))return new Response('الاجتماع غير متاح',{status:404,headers});
 // The user's RLS client ensures an uninvited employee cannot discover a meeting.
 const meeting=await db.from('wf_meetings').select('id').eq('id',id).maybeSingle();
 if(meeting.error)return new Response('تعذر تحميل الاجتماع؛ أعيدي المحاولة',{status:503,headers});
 if(!meeting.data)return new Response('الاجتماع غير متاح',{status:404,headers});
 return NextResponse.redirect(new URL(meetingPortalPath(id,profile.data.role),origin),{headers});
}
