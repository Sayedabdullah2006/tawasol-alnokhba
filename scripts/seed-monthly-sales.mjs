import 'dotenv/config';
import {config} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {defaultSalesPlan} from '../src/lib/workforce/sales.ts';
config({path:'.env.local',quiet:true});
if(!process.argv.includes('--apply'))throw Error('Use --apply to publish the approved November plan.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(!url||new URL(url).hostname!=='rbyglvwbojitxyazmgap.supabase.co')throw Error('Unexpected project; no changes made.');
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const month='2026-11';
const {data:employees,error:ee}=await db.from('wf_employees').select('id,full_name').eq('status','active');if(ee)throw ee;
const noor=employees.filter(e=>e.full_name==='نور محمود باجنيد'),monwa=employees.filter(e=>e.full_name==='منوه صالح سالم');
if(noor.length!==1||monwa.length!==1)throw Error('The two approved employees could not be identified uniquely.');
const {data:admins,error:ae}=await db.from('profiles').select('id').eq('role','admin');if(ae)throw ae;if(admins.length!==1)throw Error('Select an explicit administrator before seeding.');
const actor=admins[0].id;
async function snapshot(){const {data,error}=await db.rpc('wf_sales_snapshot',{p_actor:actor,p_month:month+'-01'});if(error)throw error;return data;}
async function command(command,payload){const s=await snapshot();const {error}=await db.rpc('wf_sales_command',{p_actor:actor,p_month:month+'-01',p_version:s.month?.version??0,p_command:command,p_payload:payload,p_key:crypto.randomUUID()});if(error)throw error;}
let s=await snapshot();
if(!s.month)await command('create_month',{closing_employee_id:noor[0].id,team_target:1,note:''});
for(const employee of [noor[0],monwa[0]]){s=await snapshot();if(!s.plans.some(p=>p.employee_id===employee.id))await command('save_plan',{employee_id:employee.id,...defaultSalesPlan(month,employee.id===noor[0].id),reason:'تنفيذ خطة نوفمبر المعتمدة من مدير الشركة'});}
s=await snapshot();const expected=s.plans.reduce((n,p)=>n+p.weekly.length,0);
if(s.month.status==='draft'||(s.month.status==='published'&&s.tasks.length<expected))await command('publish',{reason:'نشر أهداف نوفمبر وإسناد المهام الأسبوعية المعتمدة'});
s=await snapshot();
console.log(JSON.stringify({month,status:s.month.status,plans:s.plans.map(p=>({employee:employees.find(e=>e.id===p.employee_id)?.full_name,goals:p.goals.length,weeklyTasks:s.tasks.filter(t=>t.plan_id===p.id).length})),crmAccounts:s.accounts.length,crmOpportunities:s.opportunities.length,salesManager:s.managerEmployeeId===noor[0].id?'Noor':'Review manager assignment'}));
