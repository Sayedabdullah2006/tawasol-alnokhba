'use client';
import {useState} from 'react';
import PortalScreen from '@/components/layout/PortalScreen';
import AdminNavigation from '@/components/workforce/AdminNavigation';
import EmployeeNavigation from '@/components/workforce/EmployeeNavigation';
import Meetings,{type MeetingsData} from '@/components/workforce/Meetings';
import type {Meeting} from '@/lib/workforce/meetings';
const people=[{id:'admin',full_name:'عبدالله'},{id:'noor',full_name:'نور محمود باجنيد'},{id:'monwa',full_name:'منوه صالح سالم'}];
const sample=(id:string,title:string,day:string,participants:string[],hour=10):Meeting=>({id,title,description:'مراجعة المخرجات وتحديد الخطوة التالية',starts_at:`${day}T${hour}:00:00+03:00`,ends_at:`${day}T${hour+1}:00:00+03:00`,participant_ids:participants,external_attendees:[],task_id:null,reminder_minutes:15,created_by:'admin',status:'scheduled',meet_url:'https://meet.google.com/abc-defg-hij',google_event_id:null,google_etag:null,proposed_data:null,sync_state:'idle',sync_error:null,version:1});
const meetings=[sample('one','مراجعة خطة العمل الأسبوعية','2026-10-25',['admin','noor','monwa']),sample('two','متابعة استراتيجية الشركة','2026-10-26',['admin','noor'],13),sample('three','مراجعة خطة محتوى أول سعودي','2026-10-28',['noor','monwa'],11),sample('four','تسليم مشروع بلاتفورم','2026-10-29',['admin','noor'],14)];
export default function Preview(){const [viewer,setViewer]=useState('admin');const isAdmin=viewer==='admin';const data:MeetingsData={canManage:viewer!=='monwa',isAdmin,userId:viewer,schedulingReady:true,connection:isAdmin?{configured:true,connected:true,expectedEmail:'elitecnnct@gmail.com',organizerEmail:'elitecnnct@gmail.com',redirectUri:'https://nukhba.media/api/workforce/meetings/google/callback'}:null,tasks:[],people,meetings:isAdmin?meetings:meetings.filter(m=>m.participant_ids.includes(viewer))};
 return <PortalScreen area={isAdmin?'admin':'employee'}><div dir="rtl" className="mx-auto max-w-screen-2xl p-4 md:p-6">{isAdmin?<AdminNavigation activePath="/admin/workforce/meetings"/>:<EmployeeNavigation activePath="/employee/meetings"/>}<header className="my-4 flex flex-wrap items-center justify-between gap-3 text-xs"><p className="text-amber-200">معاينة محلية · مواعيد توضيحية دون إرسال رسائل</p><select aria-label="معاينة الحساب" className="rounded-xl border border-white/20 bg-[#10243c] p-3" value={viewer} onChange={e=>setViewer(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></header><Meetings key={viewer} previewData={data}/></div></PortalScreen>;
}
