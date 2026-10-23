import {readFile} from 'node:fs/promises';
import {createLeaveSummaryDB} from './leave-summary-db.mjs';
import {ids} from './work-session-db.mjs';
export async function createWorkFinanceDB(){
 const db=await createLeaveSummaryDB();await db.exec('reset role;');
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022224546_automatic_employee_insurance.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role;');
 await db.query('insert into wf_employee_insurance_settings(employee_id,rate,effective_from) values($1,10.75,$2),($3,10.75,$4)',[ids.en,'2026-10-18',ids.em,'2026-10-20']);
 return db;
}
