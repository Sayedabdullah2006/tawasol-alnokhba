import {readFile} from 'node:fs/promises';
import {createExpenseDB} from './expense-db.mjs';
import {ids} from './work-session-db.mjs';
export const weeklyMigration=new URL('../../supabase/migrations/20261026183414_weekly_attendance_compensation.sql',import.meta.url);
export async function createWeeklyDB({migration=true,baseline=null}={}){
 const db=await createExpenseDB();await db.exec(`reset role;
 alter table wf_attendance_sessions add column credit_request_id uuid,add column overtime_request_id uuid;
 create or replace function workforce_private.regular_work_end(date) returns time language sql stable as $$select time '18:00'$$;
 create function workforce_private.employee_work_end(uuid,date) returns time language sql stable as $$select case when $1='${ids.en}' and $2>='2026-10-26' then time '24:00' else workforce_private.regular_work_end($2) end$$;
 create function workforce_private.employee_work_start(uuid,date) returns time language sql stable as $$select case when $1='${ids.en}' and $2>='2026-10-26' then time '00:00' else time '09:00' end$$;
 create table workforce_private.payroll_attendance_waivers(employee_id uuid,month date,reason text);
 grant select on workforce_private.payroll_attendance_waivers to service_role;
 create function workforce_private.sick_payroll(uuid,date,date) returns jsonb language sql stable as $$select jsonb_build_object('amount','0.00','days','[]'::jsonb)$$;
 `);
 if(baseline)for(const key of ['attendance_payroll','daily_payroll_accrual'])await db.exec(baseline.functions[key]);
 // Fixtures without captured production functions still use the employee-specific
 // cutoff seam, exactly as the shipped Noor migration patches it.
 else await db.exec(`do $$declare f record;b text;begin for f in select oid,prosrc,proname from pg_proc where oid in ('workforce_private.attendance_payroll(uuid,date)'::regprocedure,'workforce_private.daily_payroll_accrual(public.wf_monthly_payroll)'::regprocedure) loop
 b:=replace(f.prosrc,'today+time ''17:00''','today+workforce_private.employee_work_end(p.employee_id,today)');
 b:=replace(b,'workforce_private.regular_work_end(d)','workforce_private.employee_work_end(p_employee,d)');
 execute replace(pg_get_functiondef(f.oid),f.prosrc,b);end loop;end$$;`);
 if(migration)await db.exec(await readFile(weeklyMigration,'utf8'));
 await db.exec(`set role service_role;set test.clock='2026-10-28T12:00:00+03:00';
 insert into wf_attendance_settings(employee_id,daily_minutes,workdays) values('${ids.en}',480,array[0,1,2,3,4,6]),('${ids.em}',480,array[0,1,2,3,4,6]);`);
 return db;
}
export const setTime=(db,at)=>db.query("select set_config('test.clock',$1,false)",[at]);
export async function addPeriod(db,employee,day,start,end,extra={}){
 const result=await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,credit_request_id,overtime_request_id,unpaid_periods) values(gen_random_uuid(),$1,$2,$3,$4,'clock',$5,$6,$7) returning id",[employee,day,`${day}T${start}+03:00`,`${day}T${end}+03:00`,extra.credit_request_id??null,extra.overtime_request_id??null,JSON.stringify(extra.unpaid_periods??[])]);
 return result.rows[0].id;
}
export const weekly=(db,actor=ids.noor,employee=ids.en,month='2026-10-01')=>db.query('select wf_weekly_hours_snapshot($1,$2,$3) value',[actor,employee,month]).then(r=>r.rows[0].value);
