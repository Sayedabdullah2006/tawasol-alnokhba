import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const ids={admin:'00000000-0000-4000-8000-000000000001',noor:'00000000-0000-4000-8000-000000000002',monwa:'00000000-0000-4000-8000-000000000003',client:'00000000-0000-4000-8000-000000000004',ne:'00000000-0000-4000-8000-000000000012',me:'00000000-0000-4000-8000-000000000013'};
export async function createSalesDB(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema workforce_private;
 create table profiles(id uuid primary key,role text);create table wf_employees(id uuid primary key,user_id uuid,full_name text,status text);
 create table wf_task_columns(id uuid primary key default gen_random_uuid(),kind text);insert into wf_task_columns(kind) values('new');
 create table wf_tasks(id uuid primary key,title text,due_at timestamptz,assignee_id uuid,column_id uuid,deleted_at timestamptz);
 create function workforce_private.assert_task_actor(actor uuid) returns uuid language plpgsql set search_path=public as $$declare emp uuid;r text;begin
 select role into r from profiles where id=actor;if r='admin' then return null;end if;
 select id into emp from wf_employees where user_id=actor and status='active';if r<>'employee' or emp is null then raise exception 'Forbidden' using errcode='42501';end if;return emp;end$$;
 create function wf_task_command(actor uuid,id uuid,version integer,command text,payload jsonb,key uuid) returns jsonb language plpgsql set search_path=public as $$begin
 insert into wf_tasks values(id,payload->>'title',(payload->>'due_at')::timestamptz,(payload->>'assignee_id')::uuid,(select wf_task_columns.id from wf_task_columns limit 1),null);return jsonb_build_object('id',id);end$$;
 insert into profiles values('${ids.admin}','admin'),('${ids.noor}','employee'),('${ids.monwa}','employee'),('${ids.client}','client');
 insert into wf_employees values('${ids.ne}','${ids.noor}','نور','active'),('${ids.me}','${ids.monwa}','منوه','active');
 grant usage on schema public,workforce_private to service_role;grant all on all tables in schema public to service_role;grant execute on all functions in schema public,workforce_private to service_role;
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261103212605_monthly_sales_crm.sql',import.meta.url),'utf8'));await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);`);await db.exec(await readFile(new URL('../../supabase/migrations/20261103220643_sales_opportunity_files_pipeline.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../../supabase/migrations/20261103220911_sales_file_evidence_integrity.sql',import.meta.url),'utf8'));await db.exec('set role service_role');return db;
}
export async function snapshot(db,actor=ids.admin,month='2026-11'){return(await db.query('select wf_sales_snapshot($1,$2) data',[actor,month+'-01'])).rows[0].data;}
export async function command(db,cmd,payload={},actor=ids.admin,month='2026-11',key=crypto.randomUUID(),version=null){const data=await snapshot(db,actor,month);return(await db.query('select wf_sales_command($1,$2,$3,$4,$5,$6) data',[actor,month+'-01',version??data.month?.version??0,cmd,payload,key])).rows[0].data;}
