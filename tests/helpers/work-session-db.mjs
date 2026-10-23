// Isolated in-memory PostgreSQL. No production configuration, SMTP or network clients.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const ids={noor:'10000000-0000-4000-8000-000000000001',monwa:'10000000-0000-4000-8000-000000000002',admin:'10000000-0000-4000-8000-000000000003',en:'20000000-0000-4000-8000-000000000001',em:'20000000-0000-4000-8000-000000000002',task:'30000000-0000-4000-8000-000000000001',other:'30000000-0000-4000-8000-000000000002',shared:'30000000-0000-4000-8000-000000000003',board:'40000000-0000-4000-8000-000000000001',fresh:'50000000-0000-4000-8000-000000000001',progress:'50000000-0000-4000-8000-000000000002',review:'50000000-0000-4000-8000-000000000003',done:'50000000-0000-4000-8000-000000000004'};
export const device='a'.repeat(64);
export async function createWorkDB(){
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema workforce_private;
 create table public.profiles(id uuid primary key,role text not null);
 create table public.wf_employees(id uuid primary key,user_id uuid references profiles(id),status text not null,start_date date not null,full_name text);
 create table public.wf_boards(id uuid primary key,archived_at timestamptz);
 create table public.wf_task_columns(id uuid primary key,board_id uuid references wf_boards(id),kind text,position int default 1,archived_at timestamptz);
 create table public.wf_tasks(id uuid primary key,title text,due_at timestamptz,assignee_id uuid,co_assignee_ids uuid[] not null default '{}',column_id uuid references wf_task_columns(id),board_id uuid references wf_boards(id),archived_at timestamptz,test_run_id uuid,blocked_reason text not null default '',version int not null default 1,updated_by uuid,updated_at timestamptz);
 create table public.wf_task_events(task_id uuid,actor_id uuid,action text,changed_fields text[],summary text);
 create table public.wf_task_dependencies(task_id uuid,depends_on_id uuid);
 create table public.wf_attendance_sessions(id uuid primary key,employee_id uuid references wf_employees(id),business_date date,checked_in timestamptz,checked_out timestamptz,checkout_key uuid unique,source text,note text default '',version int default 1,updated_by uuid references profiles(id),updated_at timestamptz default now(),check(checked_out is null or checked_out>=checked_in));
 create unique index wf_attendance_one_open on public.wf_attendance_sessions(employee_id) where checked_out is null;
 create table public.wf_task_time_entries(id uuid primary key,task_id uuid references wf_tasks(id),employee_id uuid references wf_employees(id),starts_at timestamptz,ends_at timestamptz,note text,created_by uuid,version int default 1,archived_at timestamptz,check(ends_at is null or (ends_at>starts_at and ends_at<=starts_at+interval '24 hours')));
 create table public.wf_task_time_revisions(entry_id uuid,version int,starts_at timestamptz,ends_at timestamptz,note text,archived boolean,action text,reason text,changed_by uuid);
 create function workforce_private.task_actor_unbanned(p_actor uuid) returns boolean language sql as $$select current_setting('role',true)='service_role' and exists(select 1 from public.profiles where id=p_actor)$$;
 create function workforce_private.is_admin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid and role='admin')$$;
 create function workforce_private.employee_id() returns uuid language sql stable as $$select id from public.wf_employees where user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.wf_clock_attendance(uuid,text,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 revoke all on function public.wf_clock_attendance(uuid,text,uuid) from public,anon,authenticated;
 grant execute on function public.wf_clock_attendance(uuid,text,uuid) to service_role;
 grant usage on schema public,workforce_private to service_role,authenticated;
 grant select,insert,update,delete on all tables in schema public to service_role;
 grant select on public.profiles,public.wf_employees to authenticated;
 alter table wf_attendance_sessions enable row level security;
 alter table wf_task_time_entries enable row level security;
 grant select on wf_attendance_sessions,wf_task_time_entries to authenticated;
 create policy attendance_read on wf_attendance_sessions for select to authenticated using(workforce_private.is_admin() or employee_id=workforce_private.employee_id());
 create policy time_read on wf_task_time_entries for select to authenticated using(workforce_private.is_admin() or employee_id=workforce_private.employee_id());
 `);
 const actors=await readFile(new URL('../../supabase/migrations/20260916202246_workforce_task_commands.sql',import.meta.url),'utf8');
 await db.exec(actors.slice(actors.indexOf('create function workforce_private.assert_task_actor'),actors.indexOf('create function workforce_private.command_retry')));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022213937_linked_work_sessions.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022231540_friday_attendance_guard.sql',import.meta.url),'utf8'));
 // Only this isolated test database accepts a simulated clock. The shipped migration never does.
 await db.exec(`create or replace function workforce_private.work_now() returns timestamptz language sql volatile as $$ select current_setting('test.clock')::timestamptz $$;
 insert into profiles values('${ids.noor}','employee'),('${ids.monwa}','employee'),('${ids.admin}','admin');
 insert into wf_employees values('${ids.en}','${ids.noor}','active','2026-10-18','نور'),('${ids.em}','${ids.monwa}','active','2026-10-20','منوه');
 insert into wf_boards values('${ids.board}',null);
 insert into wf_task_columns(id,board_id,kind) values('${ids.fresh}','${ids.board}','new'),('${ids.progress}','${ids.board}','in_progress'),('${ids.review}','${ids.board}','review'),('${ids.done}','${ids.board}','done');
 insert into wf_tasks(id,title,assignee_id,co_assignee_ids,column_id,board_id) values
 ('${ids.task}','إعداد استراتيجية الشركة','${ids.en}','{}','${ids.fresh}','${ids.board}'),
 ('${ids.other}','تقييم حساب أول سعودي','${ids.em}','{}','${ids.fresh}','${ids.board}'),
 ('${ids.shared}','مراجعة خطة النشر المشتركة','${ids.en}',array['${ids.em}']::uuid[],'${ids.progress}','${ids.board}');
 set role service_role;set test.clock='2026-10-24T09:00:00+03:00';`);
 return db;
}
export const at=time=>`2026-10-24T${time}:00+03:00`;
export async function clock(db,time){await db.query("select set_config('test.clock',$1,false)",[at(time)]);}
export async function snapshot(db,actor=ids.noor,employee=null){return(await db.query('select public.wf_work_snapshot($1,$2) value',[actor,employee])).rows[0].value;}
export async function command(db,input,actor=ids.noor){return(await db.query('select public.wf_work_command($1,$2,$3,$4,$5,$6,$7) value',[actor,input.command,input.request_key??crypto.randomUUID(),input.session_id??null,input.device??device,input.task_id??null,input.title??''])).rows[0].value;}
