import {readFile} from 'node:fs/promises';
import {createOvertimeDB} from './overtime-db.mjs';
export async function createExpenseDB(){
 const db=await createOvertimeDB();await db.exec('reset role');
 await db.exec(await readFile(new URL('../../supabase/migrations/20261022235359_approved_expense_reimbursements.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');return db;
}
