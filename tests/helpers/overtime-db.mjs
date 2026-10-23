import {readFile} from 'node:fs/promises';
import {createDailyPayrollDB} from './daily-payroll-db.mjs';
export async function createOvertimeDB(){
 const db=await createDailyPayrollDB();await db.exec(`reset role;
 alter table wf_employee_requests add constraint wf_employee_requests_kind_check check(kind in ('general','leave','permission','attendance-correction'));
 alter table wf_employee_requests add column amount numeric(14,2),add column title text default '',add column body text default '',add column attachments jsonb default '[]',add column fingerprint text default '',add column created_at timestamptz default now();
 alter table wf_employee_requests enable row level security;grant select on wf_employee_requests to authenticated;
 create policy requests_read on wf_employee_requests for select to authenticated using(workforce_private.is_admin() or employee_id=workforce_private.employee_id());
 `);
 const original=await readFile(new URL('../../supabase/migrations/20261018190254_workforce_scoped_test_mode.sql',import.meta.url),'utf8');
 await db.exec(original.slice(0,original.indexOf('alter table public.wf_tasks add column')));
 await db.exec(original.slice(original.indexOf('create function public.wf_test_run'),original.indexOf('create function workforce_private.mark_test_resource')));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022232330_overtime_requests_payroll.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger wf_mark_test_request before insert or update on wf_employee_requests for each row execute function workforce_private.mark_test_resource();set role service_role;`);
 return db;
}
