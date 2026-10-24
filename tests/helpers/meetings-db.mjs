import {readFile} from 'node:fs/promises';
import {createOvertimeDB} from './overtime-db.mjs';
import {ids} from './work-session-db.mjs';
const migration=name=>readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
export async function createMeetingsDB(){
 const db=await createOvertimeDB();
 await db.exec(`reset role;

 alter table wf_attendance_settings add column schedule_mode text default 'flexible';
 alter table profiles add column full_name text;
 alter table wf_employees add column if not exists can_manage_tasks boolean default false;
 update wf_employees set can_manage_tasks=true where user_id='${ids.noor}';
 create schema if not exists auth;
 create table auth.users(id uuid,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 insert into auth.users select id,id||'@example.com',now(),null,null from profiles;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant select on auth.users to service_role;
 drop rule silence_preview_notifications on wf_notifications;
 alter table wf_notifications add column id uuid default gen_random_uuid(),add unique(recipient_id,event_key);
 create table wf_notification_deliveries(notification_id uuid,recipient_id uuid,status text default 'pending',last_error text);
 create table wf_notification_delivery_settings(id boolean,enabled boolean);
 insert into wf_notification_delivery_settings values(true,true);
 create function workforce_private.notification_recipient_active(p_user uuid) returns boolean language sql as $$select exists(select 1 from public.profiles where id=p_user)$$;
 create function workforce_private.queue_notification_email() returns trigger language plpgsql as $$begin insert into public.wf_notification_deliveries(notification_id,recipient_id) values(new.id,new.recipient_id);return new;end$$;
 create trigger meeting_email_fixture after insert on wf_notifications for each row execute function workforce_private.queue_notification_email();
 create function public.wf_generate_work_confirmation_reminders(timestamptz) returns integer language sql as $$select 0$$;
 create function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb language plpgsql as $$declare added integer:=0;begin added:=added+public.wf_generate_work_confirmation_reminders(p_now);return jsonb_build_object('created',added);end$$;
 create function public.wf_claim_notification_deliveries(integer default 8) returns integer language plpgsql as $$begin return(select count(*)::int from public.wf_notification_deliveries where status='pending');end$$;
 `);
 const holidays=await migration('20261022233702_fixed_paid_holidays');
 await db.exec(holidays.slice(0,holidays.indexOf('create or replace function public.wf_work_command')));
 await db.exec(await migration('20261023022342_three_daily_work_confirmations'));
 await db.exec(await migration('20261023205919_attendance_action_gate'));
 await db.exec(await migration('20261024061024_six_pm_attendance_cutoff'));
 await db.exec(await migration('20261024140000_workforce_meetings'));
 await db.exec('grant select,insert,update,delete on all tables in schema public to service_role;set role service_role;');
 return db;
}
export const meetingCommand=async(db,id,version,command,payload={},actor=ids.admin)=>(await db.query('select wf_meeting_command($1,$2,$3,$4,$5) v',[actor,id,version,command,payload])).rows[0].v;
export const meetingPresence=async(db,id,command='join',actor=ids.noor,device='a'.repeat(64))=>(await db.query('select wf_meeting_presence($1,$2,$3,$4) v',[actor,id,command,device])).rows[0].v;
export const meetingData=(extra={})=>({title:'جلسة مراجعة خطة العمل',description:'مراجعة المخرجات والخطوة التالية',starts_at:'2026-10-24T09:00:00+03:00',ends_at:'2026-10-24T12:00:00+03:00',task_id:ids.shared,participant_ids:[ids.noor,ids.monwa,ids.admin],external_attendees:[],reminder_minutes:15,...extra});
export async function scheduled(db,data=meetingData()){
 const id=crypto.randomUUID();await meetingCommand(db,id,0,'save',data);
 await db.exec(`reset role;update workforce_private.google_meeting_connection set refresh_token_cipher='fixture';set role service_role;`);
 const prepare=await meetingCommand(db,id,1,'prepare');
 await meetingCommand(db,id,1,'finish',{lease:prepare.lease,event_id:'nf'+id.replaceAll('-',''),meet_url:'https://meet.google.com/abc-defg-hij',etag:'fixture'});
 return id;
}
