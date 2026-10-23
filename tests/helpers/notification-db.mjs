import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const migration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const extract = (sql,name) => {
 const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
 if(start<0) throw new Error(name);
 const marker=sql.slice(start).match(/\bas (\$\w*\$)/i)[1];
 const body=sql.indexOf(marker,start),end=sql.indexOf(marker,body+marker.length);
 return sql.slice(start,end+marker.length+1);
};
export const ids={admin:'00000000-0000-4000-8000-000000000001',noor:'00000000-0000-4000-8000-000000000002',monwa:'00000000-0000-4000-8000-000000000003',ne:'00000000-0000-4000-8000-000000000012',me:'00000000-0000-4000-8000-000000000013',task:'00000000-0000-4000-8000-000000000021',request:'00000000-0000-4000-8000-000000000031',submission:'00000000-0000-4000-8000-000000000041'};
export async function createNotificationDB(){
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema workforce_private;create schema auth;
 create table profiles(id uuid primary key,role text,full_name text);
 create table auth.users(id uuid,email text,email_confirmed_at timestamptz default now(),deleted_at timestamptz,banned_until timestamptz);
 create table wf_employees(id uuid primary key,user_id uuid,full_name text,status text default 'active',can_manage_tasks boolean default false,can_view_team_summaries boolean default false,version int default 1,updated_at timestamptz default now(),updated_by uuid);
 create table wf_task_assignment_admins(user_id uuid,display_name text);
 create table workforce_private.notification_email_routes(user_id uuid,email text);
 create table wf_task_columns(id uuid primary key,kind text,title text);
 insert into wf_task_columns values
 ('10000000-0000-4000-8000-000000000001','new','جديدة'),
 ('10000000-0000-4000-8000-000000000002','in_progress','قيد التنفيذ'),
 ('10000000-0000-4000-8000-000000000003','review','قيد المراجعة'),
 ('10000000-0000-4000-8000-000000000004','changes','تحتاج تعديلًا');
 create table wf_tasks(id uuid primary key,title text default 'استراتيجية الشركة',assignee_id uuid,assignee_admin_id uuid,co_assignee_ids uuid[] default '{}',column_id uuid default '10000000-0000-4000-8000-000000000001',updated_by uuid,version int default 1,description text default '',completion_criteria text default '',client_name text default '',due_at timestamptz,priority text default 'normal',blocked_reason text default '',archived_at timestamptz,test_run_id uuid);
 create table wf_task_submissions(id uuid primary key,task_id uuid,status text default 'pending',submitted_by uuid,decided_by uuid,decision_reason text,created_at timestamptz default now());
 create table wf_task_attachments(id uuid,task_id uuid,filename text,created_by uuid,created_at timestamptz default now(),archived_at timestamptz);
 create table wf_task_comments(id uuid,task_id uuid,body text,author_id uuid);
 create table wf_employee_requests(id uuid primary key,employee_id uuid,kind text,title text,status text default 'pending',starts_at timestamptz,ends_at timestamptz,amount numeric,decision_reason text,test_run_id uuid);
 create table wf_notifications(id uuid primary key default gen_random_uuid(),recipient_id uuid,kind text,title text,body text,task_id uuid,href text,event_key text,created_at timestamptz default now(),unique(recipient_id,event_key));
 create table wf_notification_deliveries(id uuid default gen_random_uuid(),notification_id uuid unique,recipient_id uuid,snapshot jsonb);
 create table wf_notification_delivery_settings(id boolean,enabled boolean,activated_at timestamptz);
 insert into wf_notification_delivery_settings values(true,true,'2020-01-01');
 create function workforce_private.notification_recipient_active(uuid) returns boolean language sql as $$select true$$;
 -- No HTTP extension or provider exists in this in-memory database.
 create function workforce_private.wake_notifications() returns void language sql as $$select null::void$$;
 insert into profiles values('${ids.admin}','admin','المدير'),('${ids.noor}','employee','نور'),('${ids.monwa}','employee','منوه');
 insert into auth.users(id,email) select id,id||'@example.com' from profiles;
 insert into wf_employees(id,user_id,full_name,can_manage_tasks) values('${ids.ne}','${ids.noor}','نور',true),('${ids.me}','${ids.monwa}','منوه',false);
 insert into workforce_private.notification_email_routes values('${ids.admin}','manager@example.com');
 `);
 const owner=await migration('20261019063111_workforce_owner_event_notifications');
 for(const name of ['queue_notification_email','notify_admin_task_event']) await db.exec(extract(owner,`workforce_private.${name}`));
 await db.exec(extract(await migration('20261019075757_workforce_task_state_notification_details'),'workforce_private.notify_task_operational_change'));
 await db.exec(extract(await migration('20261020204939_delegated_task_review'),'workforce_private.notify_task_submission'));
 await db.exec(extract(await migration('20261022224021_team_summary_access_monthly_leave'),'workforce_private.notify_workforce_changes'));
 await db.exec(await migration('20261022234236_workforce_notification_clarity'));
 await db.exec(`
 create trigger wf_employment_change_notifications after update on wf_employees for each row execute function workforce_private.notify_workforce_changes();
 create trigger wf_task_notifications after insert or update on wf_tasks for each row execute function workforce_private.notify_task_change();
 create trigger wf_shared_task_notifications after insert or update on wf_tasks for each row execute function workforce_private.notify_shared_task_change();
 create trigger wf_task_operational_notifications after update on wf_tasks for each row execute function workforce_private.notify_task_operational_change();
 create trigger wf_task_owner_activity after insert or update of column_id on wf_tasks for each row execute function workforce_private.notify_admin_task_event();
 create trigger wf_submission_notifications after insert or update on wf_task_submissions for each row execute function workforce_private.notify_task_submission();
 create trigger wf_employee_request_notifications after insert or update on wf_employee_requests for each row execute function workforce_private.notify_employee_request();
 create trigger wf_comment_notifications after insert on wf_task_comments for each row execute function workforce_private.notify_task_comment();
 create trigger wf_task_attachment_notifications after insert on wf_task_attachments for each row execute function workforce_private.notify_task_attachment();
 create trigger wf_notification_email_queue after insert on wf_notifications for each row execute function workforce_private.queue_notification_email();
 `);
 // The real BEFORE guard prevents inbox, delivery and wakeups for test resources.
 const quiet=await migration('20261018190254_workforce_scoped_test_mode');
 await db.exec(extract(quiet,'workforce_private.suppress_test_notification'));
 await db.exec('create trigger wf_00_suppress_test_notifications before insert on wf_notifications for each row execute function workforce_private.suppress_test_notification()');
 return db;
}
