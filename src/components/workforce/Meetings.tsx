'use client';
import {useCallback,useEffect,useRef,useState} from 'react';import Link from 'next/link';
import {api,Dialog,Field,Notice,controlClass,useConfirm} from './shared';import Button from '@/components/ui/Button';
import {meetingDate,localMeetingDate,meetingDefaults,validMeetURL,type Meeting,type MeetingData,type MeetingPerson,type MeetingConnection} from '@/lib/workforce/meetings';
import MeetingCalendar from './MeetingCalendar';
import {meetingDay} from '@/lib/workforce/meeting-calendar';
import {useWorkSession} from './WorkSessionProvider';
export type MeetingsData={meetings:Meeting[];people:MeetingPerson[];tasks:{id:string;title:string}[];canManage:boolean;isAdmin:boolean;userId:string;connection:MeetingConnection|null;schedulingReady?:boolean};
function announce(){window.dispatchEvent(new Event('workforce-data-changed'));}
export function MeetingCard({meeting:m,data,onChange,preview=false,onEdit,onSync}: {meeting:Meeting;data:MeetingsData;onChange:()=>void;preview?:boolean;onEdit?:(m:Meeting)=>void;onSync?:(m:Meeting,cancel?:boolean)=>void}){
 const work=useWorkSession(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[fallback,setFallback]=useState(''),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 const participating=m.participant_ids.includes(data.userId),inWindow=now>=Date.parse(m.starts_at)&&now<Date.parse(m.ends_at),ongoing=m.status==='scheduled'&&inWindow;
 const protectedMeeting=work?.data?.session?.meeting_id===m.id&&Date.parse(work.data.session.meeting_until||'')>now;
 async function presence(command:'join'|'leave'){
  if(busy||preview)return;setBusy(true);setError('');setFallback('');const popup=command==='join'?window.open('about:blank','_blank'):null;if(popup)popup.opener=null;
  try{const result=await api<{url:string;protected_until:string|null}>('/api/workforce/meetings/presence',{method:'POST',body:JSON.stringify({meeting_id:m.id,command})});announce();onChange();
   if(command==='join'&&validMeetURL(result.url)){if(popup)popup.location.href=result.url;else setFallback(result.url);}else popup?.close();
  }catch(e){popup?.close();setError((e as Error).message);}finally{setBusy(false);}
 }

 return <article className={`portal-panel flex min-w-0 flex-col gap-4 rounded-3xl border p-5 ${ongoing?'border-emerald-300/50':'border-white/15'}`}>
  <header className="flex items-start justify-between gap-3"><h3 className="text-lg font-black">{m.title}</h3><span className={`shrink-0 rounded-full px-3 py-1 text-xs ${m.status==='cancelled'?'bg-rose-100 text-rose-900':ongoing?'bg-emerald-100 text-emerald-900':'bg-blue-50 text-blue-900'}`}>{m.status==='draft'?'مسودة':m.status==='cancelled'?'ملغى':ongoing?'جارٍ الآن':'مجدول'}</span></header>
  <p className="text-sm font-bold text-amber-200">{meetingDate(m.starts_at)} — {new Date(m.ends_at).toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit'})}</p>
  {m.description&&<p className="line-clamp-3 whitespace-pre-line text-sm opacity-80">{m.description}</p>}
  <div className="flex flex-wrap gap-2 text-xs">{m.participant_ids.map(id=><span key={id} className="rounded-lg bg-white/10 px-2 py-1">{data.people.find(p=>p.id===id)?.full_name||'مشارك'}</span>)}{m.external_attendees.length>0&&<span className="rounded-lg bg-white/10 px-2 py-1">{m.external_attendees.length} مشارك خارجي</span>}</div>
  {m.task_id&&<Link href={`${data.isAdmin?'/admin/workforce/tasks/':'/employee/work/tasks/'}${m.task_id}`} className="text-xs font-bold text-amber-200">المهمة المرتبطة ←</Link>}
  {protectedMeeting&&<p className="rounded-xl bg-emerald-300/10 p-3 text-xs font-bold text-emerald-200">في اجتماع · الدوام محمي حتى {new Date(work!.data!.session!.meeting_until!).toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit'})}</p>}
  <Notice message={error||m.sync_error||''} error/>
  <div className="mt-auto flex flex-wrap gap-2">
   {m.status==='scheduled'&&participating&&<Button size="sm" disabled={preview||busy||!m.meet_url||!inWindow||work?.data?.canControl===false} title={!inWindow?'متاح خلال موعد الاجتماع':undefined} onClick={()=>void presence('join')}>الانضمام للاجتماع ↗</Button>}
   {protectedMeeting&&<Button size="sm" variant="outline" disabled={busy||preview} onClick={()=>void presence('leave')}>عدت للعمل</Button>}
   {onEdit&&m.status!=='cancelled'&&<Button size="sm" variant="outline" disabled={busy||preview} onClick={()=>onEdit(m)}>تعديل</Button>}
   {onSync&&m.status!=='cancelled'&&<>
    {(m.status==='draft'||m.proposed_data||!m.meet_url||m.sync_state==='error'||m.sync_state==='syncing')&&<Button size="sm" disabled={preview||busy||!(data.schedulingReady??data.connection?.connected)} onClick={()=>onSync(m)}>{m.status==='draft'?'جدولة وإرسال الدعوات':m.proposed_data?'نشر التعديلات':'إعادة المزامنة'}</Button>}
    <Button size="sm" variant="outline" disabled={preview||busy} onClick={()=>onSync(m,true)}>إلغاء الاجتماع</Button>
   </>}
  </div>
  {m.sync_state==='syncing'&&<p role="status" className="text-xs text-amber-200">مزامنة Google جارية…</p>}
  {fallback&&<a href={fallback} target="_blank" rel="noreferrer" className="text-sm font-bold underline">فتح Google Meet ↗</a>}
 </article>;
}
export default function Meetings({previewData}:{previewData?:MeetingsData}={}){
 const [data,setData]=useState<MeetingsData|null>(previewData??null),[error,setError]=useState(''),[fetchError,setFetchError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState('calendar'),[selectedDay,setSelectedDay]=useState(()=>meetingDay(Date.now())),[selectedId,setSelectedId]=useState<string|null>(null),[loading,setLoading]=useState(!previewData),[clock,setClock]=useState(()=>Date.now());
 const [editing,setEditing]=useState<Meeting|null>(null),[open,setOpen]=useState(false),[form,setForm]=useState<MeetingData>(meetingDefaults),[guests,setGuests]=useState(''),[draftId,setDraftId]=useState('');
 const [clientId,setClientId]=useState(''),[secret,setSecret]=useState('');const requestRef=useRef<AbortController|null>(null),lock=useRef(false),initialQuery=useRef(false),{confirm,confirmation}=useConfirm();
 const month=selectedDay.slice(0,7);
 const load=useCallback(async()=>{if(previewData)return;requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;setLoading(true);try{const result=await api<MeetingsData>(`/api/workforce/meetings?month=${month}`,{signal:controller.signal});if(!controller.signal.aborted){setData(result);setClientId(result.connection?.clientId||'');setFetchError('');}}catch(e){if(!controller.signal.aborted)setFetchError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}},[previewData,month]);
 useEffect(()=>{void Promise.resolve().then(load);const timer=setInterval(()=>{setClock(Date.now());void load();},60000);window.addEventListener('workforce-data-changed',load);return()=>{clearInterval(timer);requestRef.current?.abort();window.removeEventListener('workforce-data-changed',load);};},[load]);
 const edit=useCallback((m?:Meeting)=>{setSelectedId(null);setEditing(m??null);const source=m?.proposed_data??m;setForm(source?{title:source.title,description:source.description,starts_at:source.starts_at,ends_at:source.ends_at,task_id:source.task_id,participant_ids:source.participant_ids,external_attendees:source.external_attendees,reminder_minutes:source.reminder_minutes}:{...meetingDefaults(),participant_ids:data?[data.userId]:[]});setGuests((m?.proposed_data?.external_attendees??m?.external_attendees??[]).join('\n'));setDraftId(m?.id??crypto.randomUUID());setOpen(true);setError('');},[data]);
 useEffect(()=>{if(!data||initialQuery.current||previewData)return;initialQuery.current=true;queueMicrotask(()=>{const q=new URLSearchParams(window.location.search);if(q.get('google')==='connected')setMessage('تم ربط حساب Google');if(q.get('google')==='failed')setError('تعذر ربط Google؛ تأكد من الحساب والصلاحيات ثم أعد المحاولة');const task=q.get('task_id');if(data.canManage&&task&&data.tasks.some(t=>t.id===task)){edit();setForm(f=>({...f,task_id:task}));}});},[data,previewData,edit]);
 async function save(publish:boolean){if(lock.current||!data||previewData)return;lock.current=true;setBusy(true);setError('');let saved:Meeting|undefined;
  try{const result=await api<{meeting:Meeting}>('/api/workforce/meetings',{method:'POST',body:JSON.stringify({id:draftId,version:editing?.version??0,command:'save',payload:{...form,external_attendees:guests.split(/[\n,،;]/).map(e=>e.trim()).filter(Boolean)}})});saved=result.meeting;
   if(publish)await api('/api/workforce/meetings',{method:'POST',body:JSON.stringify({id:saved.id,version:saved.version,command:'publish'})});
   setOpen(false);setMessage(publish?'تمت جدولة الاجتماع':'حُفظت المسودة');announce();await load();
  }catch(e){setError((e as Error).message);if(saved){setOpen(false);await load();}}finally{lock.current=false;setBusy(false);}
 }
 async function sync(m:Meeting,cancel=false){if(lock.current||previewData)return;if(cancel&&!await confirm(m.status==='draft'&&m.sync_state==='idle'?'إلغاء مسودة الاجتماع؟':'إلغاء الاجتماع وإبلاغ المشاركين عبر Google؟'))return;
  lock.current=true;setBusy(true);setError('');try{await api('/api/workforce/meetings',{method:'POST',body:JSON.stringify({id:m.id,version:m.version,command:cancel?(m.status==='draft'&&m.sync_state==='idle'?'cancel_draft':'cancel'):'publish'})});announce();await load();setMessage(cancel?'ألغي الاجتماع':'اكتملت المزامنة');}catch(e){setError((e as Error).message);await load();}finally{lock.current=false;setBusy(false);}}
 const visible=data?.meetings.filter(m=>filter==='drafts'?m.status==='draft':filter==='history'?m.status==='cancelled'||Date.parse(m.ends_at)<clock:m.status==='scheduled'&&Date.parse(m.ends_at)>=clock)??[];
 return <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-8">
  {confirmation}<header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-amber-200">Google Meet · بتوقيت الرياض</p><h1 className="mt-2 text-3xl font-black">الاجتماعات</h1></div>{data?.canManage&&<Button disabled={previewData!==undefined||busy} onClick={()=>edit()}>＋ اجتماع جديد</Button>}</header>
  <Notice message={error||fetchError} error/><Notice message={message}/>
  {data?.isAdmin&&<details className="portal-panel rounded-2xl border p-4"><summary className="cursor-pointer text-sm font-bold">ربط Google · {data.connection?.connected?data.connection.organizerEmail:'غير متصل'}</summary><div className="mt-4 space-y-4">
   <p className="text-sm">المنظّم: {data.connection?.expectedEmail}</p>
   {data.connection?.configured&&!previewData&&<a className="inline-flex rounded-xl bg-amber-200 px-4 py-3 text-sm font-bold text-slate-900" href="/api/workforce/meetings/google/connect">{data.connection.connected?'إعادة ربط حساب Google':'ربط حساب Google'}</a>}
   <form className="grid gap-4 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();if(busy||previewData)return;setBusy(true);setError('');try{await api('/api/workforce/meetings/google',{method:'POST',body:JSON.stringify({command:'configure',client_id:clientId,client_secret:secret})});setSecret('');await load();setMessage('حُفظ الإعداد؛ اربط حساب Google الآن');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <Field id="meeting-google-id" label="Google OAuth Client ID"><input id="meeting-google-id" dir="ltr" className={controlClass} value={clientId} onChange={e=>setClientId(e.target.value)} required/></Field>
    <Field id="meeting-google-secret" label="Google OAuth Client Secret"><input id="meeting-google-secret" type="password" autoComplete="new-password" className={controlClass} value={secret} onChange={e=>setSecret(e.target.value)} required/></Field>
    <p className="break-all text-xs md:col-span-2">رابط إعادة التوجيه: <code dir="ltr">{data.connection?.redirectUri}</code></p><Button disabled={busy||previewData!==undefined} type="submit">حفظ إعداد الربط</Button>
   </form>
  </div></details>}
  {data?.isAdmin&&!data.connection?.connected&&<p className="rounded-xl border border-amber-200/30 bg-amber-200/10 p-4 text-sm">{data.isAdmin?'اربط حساب Google لجدولة الاجتماعات؛ يمكنك حفظ المسودات الآن.':'حساب Google بانتظار ربط المدير؛ يمكنك حفظ المسودات.'}</p>}
  <nav className="portal-toolbar flex flex-wrap gap-2" aria-label="تصفية الاجتماعات">{[['calendar','التقويم'],...(data?.canManage?[['drafts','المسودات']]:[]),['history','السجل']].map(([id,title])=><button key={id} className={`rounded-xl border px-4 py-2 text-sm ${filter===id?'bg-amber-200 text-slate-900':'bg-white/5'}`} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{title}</button>)}</nav>
  {!data?<p role="status">جارٍ تحميل الاجتماعات…</p>:filter==='calendar'?<MeetingCalendar meetings={data.meetings} selectedDay={selectedDay} today={meetingDay(clock)} loading={loading} onDayChange={setSelectedDay} onOpen={m=>setSelectedId(m.id)} onCreate={data.canManage&&!previewData?()=>{edit();setForm(f=>({...f,starts_at:`${selectedDay}T10:00:00+03:00`,ends_at:`${selectedDay}T11:00:00+03:00`}));}:undefined}/>:!visible.length?<p className="portal-panel rounded-2xl border p-6 text-sm">لا توجد اجتماعات في هذه القائمة</p>:<div className="grid items-stretch gap-4 lg:grid-cols-2">{visible.map(m=><MeetingCard key={m.id} meeting={m} data={data} onChange={()=>void load()} preview={!!previewData} onEdit={data.canManage?edit:undefined} onSync={data.canManage?sync:undefined}/>)}</div>}
  <Dialog title="تفاصيل الاجتماع" open={!!selectedId&&!!data?.meetings.some(m=>m.id===selectedId)} onClose={()=>setSelectedId(null)}>{data&&data.meetings.filter(m=>m.id===selectedId).map(m=><MeetingCard key={m.id} meeting={m} data={data} onChange={()=>void load()} preview={!!previewData} onEdit={data.canManage?edit:undefined} onSync={data.canManage?sync:undefined}/>)}</Dialog>
  <Dialog title={editing?'تعديل الاجتماع':'اجتماع جديد'} open={open} onClose={()=>{if(!busy)setOpen(false);}}><form className="space-y-4" onSubmit={e=>{e.preventDefault();void save(false);}}>
   <Field id="meeting-title" label="عنوان الاجتماع"><input id="meeting-title" className={controlClass} minLength={3} maxLength={200} required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
   <Field id="meeting-description" label="محاور الاجتماع"><textarea id="meeting-description" className={controlClass} rows={3} maxLength={10000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
   <div className="grid gap-4 sm:grid-cols-2">{(['starts_at','ends_at'] as const).map(key=><Field key={key} id={`meeting-${key}`} label={key==='starts_at'?'البداية — الرياض':'النهاية — الرياض'}><input id={`meeting-${key}`} type="datetime-local" required className={controlClass} value={form[key]?localMeetingDate(form[key]):''} onChange={e=>setForm({...form,[key]:e.target.value?new Date(`${e.target.value}:00+03:00`).toISOString():''})}/></Field>)}</div>
   <fieldset className="rounded-xl border p-4"><legend className="px-2 text-sm font-bold">المشاركون</legend><div className="flex flex-wrap gap-4">{data?.people.map(p=><label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.participant_ids.includes(p.id)} onChange={e=>setForm({...form,participant_ids:e.target.checked?[...form.participant_ids,p.id]:form.participant_ids.filter(id=>id!==p.id)})}/>{p.full_name}</label>)}</div></fieldset>
   <Field id="meeting-guests" label="بريد المشاركين الخارجيين"><textarea id="meeting-guests" rows={2} dir="ltr" className={controlClass} value={guests} onChange={e=>setGuests(e.target.value)}/></Field>
   <div className="grid gap-4 sm:grid-cols-2"><Field id="meeting-task" label="المهمة المرتبطة"><select id="meeting-task" className={controlClass} value={form.task_id||''} onChange={e=>setForm({...form,task_id:e.target.value||null})}><option value="">دون مهمة مرتبطة</option>{data?.tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field><Field id="meeting-reminder" label="التذكير قبل الاجتماع"><select id="meeting-reminder" className={controlClass} value={form.reminder_minutes} onChange={e=>setForm({...form,reminder_minutes:Number(e.target.value)})}>{[5,15,30,60].map(n=><option key={n} value={n}>{n} دقيقة</option>)}</select></Field></div>
   <div className="flex flex-wrap gap-3"><Button type="submit" variant="outline" disabled={busy}>حفظ المسودة</Button><Button type="button" disabled={busy||!(data?.schedulingReady??data?.connection?.connected)} onClick={e=>{if(e.currentTarget.form?.reportValidity())void save(true);}}>جدولة وإرسال الدعوات</Button></div>
  </form></Dialog>
 </div>;
}
