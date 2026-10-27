import {readFile} from 'node:fs/promises';import {createWeeklyDB,setTime} from './weekly-hours-db.mjs';
export {ids} from './work-session-db.mjs';export {setTime};
const sql=name=>readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
export async function createSettlementDB({final=true}={}){const db=await createWeeklyDB();await db.exec(`reset role;
 alter table wf_employees add column if not exists contract_end date default '2035-12-31',add column if not exists job_title text default 'موظفة',add column if not exists email text default 'preview@example.invalid';
 alter table wf_employee_requests add column if not exists version int default 1,add column if not exists decided_by uuid,add column if not exists decided_at timestamptz,add column if not exists decision_reason text,add column if not exists work_day date;
 create function workforce_private.paid_holiday(p_day date) returns text language sql stable set search_path='' as $$select case to_char(p_day,'MM-DD') when '02-22' then 'يوم التأسيس' when '09-23' then 'اليوم الوطني' else null end$$;
 create function workforce_private.attendance_reminder_needed(p_employee uuid,p_day date) returns boolean language sql stable set search_path='' as $$select exists(select 1 from public.wf_employees e where e.id=p_employee and e.start_date<=p_day)$$;
 create function workforce_private.notification_recipient_matches_email(uuid,text) returns boolean language sql stable as $$select true$$;
 create schema if not exists cron;create function cron.schedule(text,text,text) returns int language sql as $$select 1$$;
 create function workforce_private.notify_employee_request() returns trigger language plpgsql as $$begin return new;end$$;
 create table if not exists wf_leave_entitlements(employee_id uuid,year int,days numeric);
 create table if not exists wf_leave_movements(request_id uuid,employee_id uuid,year int,days numeric);

 create or replace function workforce_private.sick_payroll(p_employee uuid,p_month date,p_through date) returns jsonb language plpgsql stable set search_path='' as $$begin return jsonb_build_object('amount','0','days','[]'::jsonb);end$$;
 grant select,insert,update,delete on all tables in schema public to service_role;
 `);
 for(const name of ['20261027190701_approved_unpaid_leave_payroll','20261027192501_unpaid_leave_estimates','20261027192637_unpaid_estimate_authorization_lock'])await db.exec(await sql(name));
 const baseline=JSON.parse(await readFile(new URL('../fixtures/settlement-baseline.json',import.meta.url),'utf8'));for(const f of baseline)await db.exec(f.definition);
 await db.exec(await readFile(new URL('../fixtures/settlement-weekly-report.sql',import.meta.url),'utf8'));
 for(const name of ['20261027195445_employee_resignation_requests',...(final?['20261027204709_final_employee_settlements']:[])]){try{await db.exec(await sql(name));}catch(e){throw Error(name+': '+e.message+' at '+e.position);}}
 await db.exec('set role service_role;');return db;}
export async function accept(db,employee,at='2026-10-27T15:00:00+03:00'){await setTime(db,at);const r=await db.query("insert into wf_employee_requests(employee_id,kind,title,body,status) values($1,'resignation','طلب استقالة','أسباب شخصية','pending') returning id",[employee]);const id=r.rows[0].id;const {ids}=await import('./work-session-db.mjs');await db.query("select wf_decide_resignation($1,$2,1,'approved','قبول الاستقالة')",[id,ids.admin]);return id;}
export async function settlement(db,id,command='quote',version=0,payload={},key=crypto.randomUUID(),actor=null){const {ids}=await import('./work-session-db.mjs');return(await db.query('select wf_final_settlement($1,$2,$3,$4,$5,$6) v',[actor??ids.admin,id,command,version,payload,key])).rows[0].v;}
