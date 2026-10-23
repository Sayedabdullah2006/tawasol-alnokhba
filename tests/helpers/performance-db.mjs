import {readFile} from 'node:fs/promises';
import {createNotificationDB,ids} from './notification-db.mjs';
export {ids};
const migration=name=>readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
function extract(sql,name){const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));if(start<0)throw Error(name);const marker=sql.slice(start).match(/\bas (\$\w*\$)/i)[1],body=sql.indexOf(marker,start),end=sql.indexOf(marker,body+marker.length);return sql.slice(start,end+marker.length+1);}
export const columns={fresh:'10000000-0000-4000-8000-000000000001',review:'10000000-0000-4000-8000-000000000003',changes:'10000000-0000-4000-8000-000000000004',done:'10000000-0000-4000-8000-000000000005'};
export const board='40000000-0000-4000-8000-000000000001';
export const run='60000000-0000-4000-8000-000000000001';
export async function createPerformanceDB(){
 const db=await createNotificationDB();
 await db.exec(`alter role service_role bypassrls;
 alter table wf_employees add column start_date date default '2026-10-01';
 create function public.wf_weekly_report_data(date) returns setof jsonb language sql as $$select value from jsonb_array_elements(coalesce(nullif(current_setting('fixture.weekly_reports',true),''),'[]')::jsonb)$$;
 create table wf_boards(id uuid primary key default gen_random_uuid(),title text,archived_at timestamptz,is_team_workspace boolean default true,allow_self_tasks boolean default false,created_by uuid);
 insert into wf_boards(id) values('${board}');
 alter table wf_task_columns add column board_id uuid default '${board}',add column position int default 0,add column archived_at timestamptz;
 insert into wf_task_columns(id,kind,title) values('${columns.done}','done','مكتملة');
 alter table wf_tasks add column board_id uuid default '${board}',add column parent_id uuid,add column created_by uuid,add column assignment_origin text default 'admin',add column shared_with_board boolean default false,add column position bigint default 1,add column starts_at timestamptz default now(),add column estimate_minutes int,add column requires_approval boolean default true,add column updated_at timestamptz default now(),add column completed_at timestamptz,add column created_at timestamptz default now(),add column deleted_at timestamptz,add column deleted_by uuid;
 alter table wf_task_submissions alter column id set default gen_random_uuid(),add column summary text default '',add column decided_at timestamptz,add column submission_number bigint generated always as identity;
 create unique index pending_submission on wf_task_submissions(task_id) where status='pending';
 create table wf_board_members(board_id uuid,employee_id uuid);
 create table wf_task_checklist(task_id uuid,required boolean,completed boolean);
 create table wf_task_dependencies(task_id uuid,depends_on_id uuid);
 create table workforce_private.command_receipts(actor_id uuid,request_id uuid,command text,entity_id uuid,payload jsonb,response jsonb,created_at timestamptz default now(),primary key(actor_id,request_id));
 create function workforce_private.is_admin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid and role='admin')$$;
 create function workforce_private.employee_id() returns uuid language sql stable as $$select id from public.wf_employees where user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 -- Attachment storage is outside this evaluation suite; the command still calls its seam.
 create function workforce_private.link_submission_files(uuid,uuid,jsonb) returns void language sql as $$select null::void$$;
 create function public.wf_test_run(text,uuid,uuid) returns jsonb language plpgsql as $$begin if $3<>'${run}'::uuid then raise exception 'invalid run';end if;return '{}'::jsonb;end$$;
 `);
 const base=await migration('20260916202246_workforce_task_commands');
 for(const name of ['task_actor_unbanned','assert_task_actor','save_command','guard_task_record'])await db.exec(extract(base,`workforce_private.${name}`));
 const delegation=await migration('20261018170023_workforce_task_delegation');
 for(const name of ['can_manage_tasks','assert_task_admin_assignee','validate_task_payload'])await db.exec(extract(delegation,`workforce_private.${name}`));
 await db.exec(extract(await migration('20261020175537_workforce_task_visibility_hierarchy'),'workforce_private.validate_task_payload'));
 await db.exec(await migration('20261020205329_review_reason_payload'));
 await db.exec(extract(await migration('20261020205330_silent_task_deletion'),'public.wf_task_command'));
 await db.exec(extract(await migration('20261018190254_workforce_scoped_test_mode'),'public.wf_test_task_command'));
 await db.exec(await migration('20261023004323_fair_employee_performance'));
 await db.exec(await migration('20261023011356_unified_performance_history_weekly'));
 await db.exec(`create trigger task_guard before insert or update on wf_tasks for each row execute function workforce_private.guard_task_record();
 grant usage on schema public,workforce_private,auth to service_role,authenticated;
 grant all on all tables in schema public,workforce_private to service_role;
 grant execute on all functions in schema workforce_private to service_role;
 grant execute on function public.wf_task_command(uuid,uuid,integer,text,jsonb,uuid),public.wf_test_task_command(uuid,uuid,uuid,integer,text,jsonb,uuid) to service_role;
 grant usage,select on all sequences in schema public to service_role;
 set role service_role;`);
 return db;
}
export async function addTask(db,{id=crypto.randomUUID(),owner=ids.ne,shared=[],due=null}={}){await db.query(`insert into wf_tasks(id,title,assignee_id,co_assignee_ids,due_at,test_run_id,created_by) values($1,'خطة عمل',$2,$3,coalesce($4::timestamptz,now()+interval '3 days'),$5,$6)`,[id,owner,shared,due,run,ids.admin]);return id;}
export async function version(db,id){return (await db.query('select version from wf_tasks where id=$1',[id])).rows[0].version;}
export async function performance(db,actor,id,command,payload,key=crypto.randomUUID(),v=null){return (await db.query('select wf_performance_command($1,$2,$3,$4,$5,$6) value',[actor,id,v??await version(db,id),command,JSON.stringify(payload),key])).rows[0].value;}
export async function taskCommand(db,actor,id,command,payload,key=crypto.randomUUID(),v=null){return (await db.query('select wf_test_task_command($1,$2,$3,$4,$5,$6,$7) value',[run,actor,id,v??await version(db,id),command,JSON.stringify(payload),key])).rows[0].value;}
export async function review(db,actor,id,payload,key=crypto.randomUUID(),v=null){return (await db.query('select wf_evaluated_task_command($1,$2,$3,$4,$5,$6,$7) value',[actor,id,v??await version(db,id),'review',JSON.stringify(payload),key,run])).rows[0].value;}
