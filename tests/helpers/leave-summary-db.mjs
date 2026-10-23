import {readFile} from 'node:fs/promises';
import {createPayrollDB} from './payroll-attendance-db.mjs';
export async function addLeaveSummarySchema(db){
 await db.exec(`reset role;
 create table wf_leave_entitlements(employee_id uuid,year int,days numeric(7,2),reason text,updated_by uuid,updated_at timestamptz,primary key(employee_id,year));
 create table wf_leave_movements(request_id uuid,employee_id uuid,year int,days numeric(7,2),primary key(request_id,year));
 create table wf_audit_events(entity_table text,entity_id text,action text,actor_id uuid,changed_fields text[]);
 alter table wf_employee_requests add column attendance_session_id uuid,add column version int default 1,add column decision_reason text,add column decided_by uuid,add column decided_at timestamptz;
 alter table wf_attendance_settings add column starts_at time,add column ends_at time,add column updated_by uuid,add column updated_at timestamptz;
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022224021_team_summary_access_monthly_leave.sql',import.meta.url),'utf8'));
 await db.exec(`grant select,insert,update,delete on all tables in schema public to service_role;set role service_role;`);
}
export async function createLeaveSummaryDB(){const db=await createPayrollDB();await addLeaveSummarySchema(db);return db;}
export const leaveBalance=async(db,actor,employee)=>(await db.query('select wf_leave_balance($1,$2) value',[actor,employee])).rows[0].value;
