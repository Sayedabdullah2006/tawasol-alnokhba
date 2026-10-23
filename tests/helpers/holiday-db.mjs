import {readFile} from 'node:fs/promises';import {createDailyPayrollDB} from './daily-payroll-db.mjs';
export async function createHolidayDB(){
 const db=await createDailyPayrollDB();await db.exec(`reset role;
 alter table wf_employees add column contract_end date,add column email text default 'fixture@example.com';
 alter table wf_tasks add column deleted_at timestamptz,add column completed_at timestamptz,add column created_at timestamptz default now();
 create table wf_task_submissions(id uuid,task_id uuid,created_at timestamptz,decided_at timestamptz,status text,submitted_by uuid);
 create function workforce_private.notification_recipient_active(uuid) returns boolean language sql as $$select true$$;
 create function workforce_private.notification_recipient_matches_email(uuid,text) returns boolean language sql as $$select true$$;
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022233702_fixed_paid_holidays.sql',import.meta.url),'utf8'));
 await db.exec('grant select on all tables in schema public to service_role;set role service_role;');return db;
}
