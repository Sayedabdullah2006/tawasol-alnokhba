import {notFound} from 'next/navigation';
import PortalScreen from '@/components/layout/PortalScreen';
import AdminNavigation from '@/components/workforce/AdminNavigation';
import Meetings,{type MeetingsData} from '@/components/workforce/Meetings';
export default function Page(){
 if(process.env.NODE_ENV!=='development')notFound();
 const start='2026-10-25T10:00:00+03:00',end='2026-10-25T11:00:00+03:00';
 const data:MeetingsData={canManage:true,isAdmin:true,userId:'admin',connection:{configured:false,connected:false,expectedEmail:'elitecnnct@gmail.com',organizerEmail:null,redirectUri:'https://nukhba.media/api/workforce/meetings/google/callback'},tasks:[],people:[{id:'noor',full_name:'نور محمود باجنيد'},{id:'monwa',full_name:'منوه صالح سالم'},{id:'admin',full_name:'عبدالله'}],meetings:[{id:'local-preview',title:'مراجعة خطة العمل الأسبوعية',description:'متابعة المهام واعتماد الخطوات القادمة',starts_at:start,ends_at:end,participant_ids:['noor','monwa','admin'],external_attendees:[],task_id:null,reminder_minutes:15,created_by:'admin',status:'scheduled',meet_url:'https://meet.google.com/abc-defg-hij',google_event_id:null,google_etag:null,proposed_data:null,sync_state:'idle',sync_error:null,version:1}]};
 return <PortalScreen area="admin"><div dir="rtl" className="mx-auto max-w-screen-2xl p-5"><AdminNavigation activePath="/admin/workforce/meetings"/><p className="mt-5 text-xs text-amber-200">معاينة محلية · دون دعوات أو رسائل</p><Meetings previewData={data}/></div></PortalScreen>;
}
