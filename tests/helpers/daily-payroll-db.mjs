import {readFile} from 'node:fs/promises';
import {createWorkFinanceDB} from './work-finance-db.mjs';
export async function createDailyPayrollDB(){
 const db=await createWorkFinanceDB();await db.exec('reset role;');
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022230814_daily_payroll_accrual.sql',import.meta.url),'utf8'));
 await db.exec("update workforce_private.payroll_attendance_policy set starts_on='2026-10-01';set role service_role;");
 return db;
}
