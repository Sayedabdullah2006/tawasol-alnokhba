import {readFile} from 'node:fs/promises';
import {createWorkDB,ids} from './work-session-db.mjs';
export async function addPayrollSchema(db){
 await db.exec(`reset role;
 create table wf_attendance_settings(employee_id uuid primary key,daily_minutes int,workdays int[]);
 create table wf_compensation_versions(employee_id uuid,basic_salary numeric,allowances jsonb,effective_from date,revision int);
 create table wf_employee_requests(id uuid primary key default gen_random_uuid(),employee_id uuid,kind text,status text,leave_type text not null default 'paid',starts_at timestamptz,ends_at timestamptz,test_run_id uuid);
 create table wf_notifications(recipient_id uuid,kind text,title text,body text,href text,event_key text);
 create rule silence_preview_notifications as on insert to wf_notifications do instead nothing;
 create function workforce_private.command_retry(uuid,uuid,text,uuid,jsonb) returns jsonb language sql as $$select null::jsonb$$;
 create function workforce_private.save_command(uuid,uuid,text,uuid,jsonb,jsonb) returns jsonb language sql as $$select $6$$;
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261018102433_workforce_monthly_payroll.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261018124256_workforce_payroll_deductions.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022221900_automatic_attendance_payroll.sql',import.meta.url),'utf8'));
 await db.exec(`grant select,insert,update,delete on all tables in schema public to service_role;
 grant select on workforce_private.payroll_attendance_policy to service_role;
 set role service_role;`);
}
export async function createPayrollDB(){
 const db=await createWorkDB();await addPayrollSchema(db);
 await db.exec(`reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-24',cutoff_on='2026-10-24';set role service_role;
 insert into wf_compensation_versions values('${ids.en}',3200,'[{"name":"بدل السكن","amount":"800"},{"name":"بدل النقل","amount":"500"},{"name":"بدل مهام إضافية","amount":"1930"}]','2026-10-18',1),('${ids.em}',3200,'[{"name":"بدل السكن","amount":"800"}]','2026-10-20',1);
 insert into wf_monthly_payroll(employee_id,month,basic_amount,allowances_amount,total_amount,gross_amount,updated_by) values
 ('${ids.en}','2026-10-01',1493.33,1507.34,3000.67,3000.67,'${ids.admin}'),('${ids.em}','2026-10-01',1280,320,1600,1600,'${ids.admin}');`);
 return db;
}
export async function payrollSnapshot(db,actor=ids.noor,employee=ids.en,month='2026-10-01'){
 return (await db.query('select public.wf_attendance_payroll_snapshot($1,$2,$3) value',[actor,employee,month])).rows[0].value;
}
