import test from 'node:test';
import assert from 'node:assert/strict';
import {combinePerformance} from '../src/lib/workforce/overall-performance.ts';
import {evaluatePerformance} from '../src/lib/workforce/performance.ts';
import {evaluateSales,defaultSalesPlan} from '../src/lib/workforce/sales.ts';
import {createSalesDB,command,snapshot,ids} from './helpers/sales-db.mjs';
const month='2026-11',now=new Date('2026-11-30T20:00:00+03:00');
const task=i=>({task_id:String(i),title:'تكليف موثق',size:'medium',due_at:'2026-11-10T17:00:00+03:00',configured_at:'2026-11-01T09:00:00+03:00',state:'done',shared:false,withdrawn:false,responsibility:'تنفيذ',exception_reason:null,deliveries:[{round:1,delivered_at:'2026-11-10T15:00:00+03:00',due_at:'2026-11-10T17:00:00+03:00',status:'approved',category:null,incomplete:false,affected:false,decided_at:'2026-11-10T16:00:00+03:00'}]});
test('overall evaluation keeps the task formula and combines approved sales results at 60/40',()=>{
 const tasks=evaluatePerformance(Array.from({length:5},(_,i)=>task(i)),month,now);assert.equal(tasks.score,100);assert.deepEqual(tasks.axes,{punctuality:100,quality:100,completion:100});const before=JSON.stringify(tasks);
 const plan={employee_id:ids.ne,month,competition_weight:100,goals:[{key:'qualify',title:'فرص مؤهلة',metric:'qualified',target:2,weight:100,group:'competition',excluded:false}]};
 const facts=[{id:'approved',employee_id:ids.ne,month,metric:'qualified',opportunity_id:'first',status:'approved'},{id:'pending',employee_id:ids.ne,month,metric:'qualified',opportunity_id:'second',status:'pending'}];
 assert.equal(combinePerformance(tasks,evaluateSales(plan,facts).total).score,70);facts[1].status='approved';assert.equal(combinePerformance(tasks,evaluateSales(plan,facts).total).score,100);assert.equal(JSON.stringify(tasks),before);
 assert.equal(combinePerformance({...tasks,score:90},80).score,84);
});
test('five-task threshold, missing axes and excluded sales are never turned into a final zero or silently reweighted',()=>{
 const four=evaluatePerformance(Array.from({length:4},(_,i)=>task(i)),month,now);assert.equal(four.score,null);const total=combinePerformance(four,80);assert.equal(total.score,null);assert.match(total.pending[0],/4\/5/);
 const five=evaluatePerformance(Array.from({length:5},(_,i)=>task(i)),month,now);assert.equal(combinePerformance(five,null).score,null);
 assert.equal(combinePerformance(five,0).score,40);assert.equal(combinePerformance(four,80,100).score,80);assert.equal(combinePerformance(five,null,0).score,100);
 assert.equal(combinePerformance(five,null,60,false).score,100);assert.equal(combinePerformance(five,null,60,false).mode,'tasks');assert.throws(()=>combinePerformance(five,80,101));
});
test('monthly threshold four releases the grade only after four eligible approvals, with the same 60/40 blend',()=>{
 const four=Array.from({length:4},(_,i)=>task(i));
 const three=evaluatePerformance(four.slice(0,3),month,now,4);assert.equal(three.score,null);assert.equal(three.required,4);
 const pending=structuredClone(four);pending[3].deliveries[0].status='pending';pending[3].deliveries[0].decided_at=null;
 assert.equal(evaluatePerformance(pending,month,now,4).score,null);
 const approved=evaluatePerformance(four,month,now,4);assert.equal(approved.eligible,4);assert.equal(approved.score,100);assert.equal(combinePerformance(approved,22,60).score,53.2);
 assert.equal(evaluatePerformance(four,month,now).score,null);assert.equal(evaluatePerformance(four,month,now).required,5);
 assert.deepEqual(approved.axes,{punctuality:100,quality:100,completion:100});
 for(const value of [0,1.5,101,NaN])assert.throws(()=>evaluatePerformance(four,month,now,value));
});
test('four weekly tasks approved early qualify immediately; future open work and pending approvals do not',()=>{
 const asOf=new Date('2026-11-04T12:00:00+03:00');
 const weekly=[7,14,21,30].map((day,i)=>{const t=task(i),due=`2026-11-${String(day).padStart(2,'0')}T17:00:00+03:00`;return {...t,due_at:due,deliveries:[{...t.deliveries[0],due_at:due,delivered_at:'2026-11-04T10:00:00+03:00',decided_at:'2026-11-04T11:00:00+03:00'}]};});
 const three=evaluatePerformance(weekly.slice(0,3),month,asOf,4);assert.equal(three.eligible,3);assert.equal(three.score,null);
 const pending=structuredClone(weekly);pending[3].deliveries[0].status='pending';pending[3].deliveries[0].decided_at=null;assert.equal(evaluatePerformance(pending,month,asOf,4).score,null);
 const final=evaluatePerformance(weekly,month,asOf,4);assert.equal(final.eligible,4);assert.equal(final.score,100);assert.ok(final.rows.every(r=>r.reason===''));assert.equal(combinePerformance(final,22,60).score,53.2);
 const open=task('open');open.state='new';open.due_at='2026-11-30T17:00:00+03:00';open.deliveries=[];
 assert.equal(evaluatePerformance([...weekly,open],month,asOf,4).score,100);
 const nextPeriod=structuredClone(weekly[0]);nextPeriod.due_at='2026-12-07T17:00:00+03:00';nextPeriod.deliveries[0].due_at=nextPeriod.due_at;assert.equal(evaluatePerformance([nextPeriod],month,asOf,1).score,null);assert.equal(evaluatePerformance([nextPeriod],'2026-12',new Date('2026-12-08T12:00:00+03:00'),1).score,100);
 const decidedLater=structuredClone(weekly);decidedLater[3].deliveries[0].decided_at='2026-11-05T11:00:00+03:00';assert.equal(evaluatePerformance(decidedLater,month,asOf,4).score,null);
});
test('only company admin can change monthly blend weights; another month remains independent',async()=>{
 const db=await createSalesDB();try{
 await command(db,'create_month',{closing_employee_id:ids.ne,team_target:1,performance_sales_weight:60});for(const id of [ids.ne,ids.me])await command(db,'save_plan',{employee_id:id,...defaultSalesPlan(month,id===ids.ne),reason:'خطة منشورة'});await command(db,'publish',{});
 const settings={closing_employee_id:ids.ne,manager_employee_id:ids.ne,team_target:1,performance_sales_weight:70,minimum_tasks:4,note:'خطة',reason:'تعديل وزن التقييم'};
 const before=(await snapshot(db)).month;for(const actor of [ids.noor,ids.monwa])await assert.rejects(command(db,'settings',settings,actor),/للإدارة/);
 assert.equal((await snapshot(db)).month.version,before.version);await command(db,'settings',settings);assert.equal((await snapshot(db)).month.performance_sales_weight,70);assert.equal((await snapshot(db)).month.minimum_tasks,4);
 await command(db,'create_month',{closing_employee_id:ids.ne,performance_sales_weight:50},ids.admin,'2026-12');assert.equal((await snapshot(db)).month.performance_sales_weight,70);assert.equal((await snapshot(db,ids.admin,'2026-12')).month.performance_sales_weight,50);
 await assert.rejects(command(db,'settings',{...settings,performance_sales_weight:101}));
 assert.equal((await snapshot(db,ids.admin,'2026-12')).month.minimum_tasks,5);
 await assert.rejects(command(db,'settings',{...settings,minimum_tasks:0}));
 }finally{await db.close();}
});
