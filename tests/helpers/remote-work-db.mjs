import {readFile} from 'node:fs/promises';
import {createSettlementDB,ids,setTime} from './settlement-db.mjs';
export {ids,setTime};
export const remoteMigration='20261027210844_temporary_remote_work_agreements';
export const input={starts_on:'2026-11-01',ends_on:'2026-11-30',starts_time:'09:00',location:'الرياض · المنزل',duties:'متابعة العملاء والمهام الأساسية المتفق عليها',reason:'ظروف مؤقتة مع الاقتصار على المهام الأساسية'};
export const signature=[Array.from({length:20},(_,i)=>[100+i*18,100+(i%4)*15])];
export async function createRemoteDB({migration=true}={}){const db=await createSettlementDB();await db.exec(`reset role;
 create schema if not exists auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table if not exists wf_audit_events(entity_table text,entity_id text,action text,actor_id uuid,changed_fields text[]);
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 alter table wf_employee_requests add column if not exists fingerprint text;
 alter table wf_employees add column national_id text default '0000000000',add column national_address text default 'عنوان محلي للمعاينة',add column phone text default '0500000000',add column city text default 'الرياض',add column flexible_workday_from date;
 update wf_compensation_versions set basic_salary=3200,allowances='[{"name":"بدل السكن","amount":"800"},{"name":"بدل النقل","amount":"500"},{"name":"بدل مهام إضافية ثابت","amount":"1930"}]' where employee_id='${ids.en}';
 update wf_compensation_versions set basic_salary=3200,allowances='[{"name":"بدل السكن","amount":"800"}]' where employee_id='${ids.em}';
 `);
 await db.exec(await readFile(new URL('../fixtures/remote-request-decision.sql',import.meta.url),'utf8'));
 if(!migration){await db.exec('set role service_role');await setTime(db,'2026-10-28T08:00:00+03:00');return db;}
 await db.exec(await readFile(new URL(`../../supabase/migrations/${remoteMigration}.sql`,import.meta.url),'utf8'));
 await db.exec(`insert into wf_remote_company values(true,'شركة تواصل النخبة للدعاية والإعلان','0000000000','عنوان منشأة للمعاينة','ممثل المنشأة','preview@example.invalid','0500000000','بيانات محاكاة فقط');
 insert into wf_remote_contracts values('${ids.en}','PREVIEW-NOOR','عقد محاكاة'),('${ids.em}','PREVIEW-MONWA','عقد محاكاة');set role service_role;`);
 await setTime(db,'2026-10-28T08:00:00+03:00');return db;
}
export async function quote(db,p=input,actor=ids.noor){return(await db.query('select wf_remote_work_quote($1,$2) value',[actor,p])).rows[0].value;}
export async function submit(db,q,p=input,s=signature,key=crypto.randomUUID(),ack=true,actor=ids.noor){await db.query('select wf_submit_remote_work($1,$2,$3,$4,$5,$6)',[actor,key,p,q.hash,s,ack]);return key;}
export async function approve(db,id){await db.query("select wf_decide_employee_request($1,$2,1,'approved','اعتماد الاتفاق')",[id,ids.admin]);}
