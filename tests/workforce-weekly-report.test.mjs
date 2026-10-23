import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWeeklyReport,weeklyFeedback,renderWorkforceEmail,workforceMailCC} from '../supabase/functions/_shared/workforce-email.ts';
const report={evidenceVersion:2,periodStart:'2026-10-17',periodEnd:'2026-10-23',asOf:'2026-10-23T21:00:00Z',month:'2026-10',completed:2,unfinished:3,pendingReview:1,overdue:0,onTime:2,lateSubmissions:0,changesCount:0,repeatedChanges:0,weekWorkedMinutes:2400,weekRequiredMinutes:2400,monthWorkedMinutes:3000,openTasks:[]};
test('feedback recognizes on-time delivery and working hours without inventing quality scores',()=>{
 const messages=weeklyFeedback(report),text=messages.join('\n');assert.equal(messages.length,1);assert.match(text,/أحسنتِ/);assert.match(text,/التزامك بالمواعيد/);assert.doesNotMatch(text,/الفارق|ضعيف|عقوبة|خصم/);assert.ok(text.split(/\s+/).length<55);
});
test('short hours, late tasks and repeated revisions produce respectful actionable feedback',()=>{
 const text=weeklyFeedback({...report,weekWorkedMinutes:2100,overdue:1,lateSubmissions:1,repeatedChanges:2,changesCount:4}).join('\n');
 assert.match(text,/فترات حضورك/);assert.match(text,/نحن هنا لدعمك/);assert.match(text,/قائمة تحقق/);assert.match(text,/العوائق/);assert.doesNotMatch(text,/رائع|فاشل|عقوبة|خصم|5 س/);assert.ok(text.split(/\s+/).length<55);
});
test('no due-date evidence produces a neutral message, and leave-only weeks no hours warning',()=>{
 const text=weeklyFeedback({...report,onTime:0,lateSubmissions:0,weekRequiredMinutes:0,weekWorkedMinutes:0}).join('\n');assert.match(text,/حددي أولوياتك/);assert.doesNotMatch(text,/التزامك بالمواعيد|تحقيق مستهدف|حضورك/);
});
test('weekly HTML is branded, escaped and has one authorized manager CC only',()=>{
 const mail={email:'employee@example.com',name:'<نور>',kind:'weekly_report',title:'التقرير الأسبوعي',href:'/employee',createdAt:report.asOf,cc:['other@example.com','elitecnnct@gmail.com'],weeklyReport:{...report,openTasks:[{title:'<script>bad</script>',dueAt:null,pendingReview:true}]}};
 const rendered=renderWorkforceEmail(mail);assert.match(rendered.html,/logo.png/);assert.match(rendered.html,/&lt;نور&gt;/);assert.doesNotMatch(rendered.html,/<script>/);assert.match(rendered.text,/ساعات أكتوبر/);assert.deepEqual(workforceMailCC(mail),['elitecnnct@gmail.com']);assert.equal((rendered.html.match(/رسالة لكِ/g)||[]).length,1);assert.doesNotMatch(rendered.html,/أقرب المهام غير المكتملة/);
 assert.equal(workforceMailCC({...mail,kind:'assigned'}),undefined);assert.equal(workforceMailCC({...mail,email:'elitecnnct@gmail.com'}),undefined);
 assert.throws(()=>renderWorkforceEmail({...mail,weeklyReport:undefined}),/snapshot missing/);
});

test('Saturday report uses exactly the dashboard engine and one compact motivation block',async()=>{
 const {performanceFacts,evaluatePerformance}=await import('../src/lib/workforce/performance.ts');
 const e={task_id:'t',title:'مهمة مشتركة',employee_id:'e',employee_start:'2026-10-18',created_at:'2026-10-18T00:00:00Z',starts_at:'2026-10-19T09:00:00+03:00',due_at:'2026-10-19T17:00:00+03:00',state:'done',shared:true,participant_count:2,archived:false,history:[],submissions:[],exceptions:[],config:{starts_at:'2026-10-19T09:00:00+03:00',weight_due_at:'2026-10-19T17:00:00+03:00',due_at:'2026-10-19T17:00:00+03:00',configured_at:'2026-10-18T00:00:00Z',withdrawn:false,responsibility:'',participant_count:2},deliveries:[{round:1,delivered_at:'2026-10-19T16:00:00+03:00',due_at:'2026-10-19T17:00:00+03:00',status:'approved',category:null,incomplete:false,affected:false,decided_at:'2026-10-20T00:00:00Z'}]};
 const input={...report,evidenceVersion:undefined,performanceEvidence:[e]},normalized=normalizeWeeklyReport(input);assert.deepEqual(normalized.performance,evaluatePerformance(performanceFacts([e],new Date(input.asOf)),input.month,new Date(input.asOf)));assert.equal(normalized.performance.rows[0].weight,0.5);
 const rendered=renderWorkforceEmail({email:'preview@example.invalid',name:'نور',kind:'weekly_report',title:'التقرير الأسبوعي',href:'/employee',createdAt:input.asOf,weeklyReport:input});assert.equal((rendered.html.match(/أداء أكتوبر حتى/g)||[]).length,1);assert.equal((rendered.html.match(/رسالة لكِ/g)||[]).length,1);assert.equal((rendered.html.match(/class="metric"/g)||[]).length,4);assert.match(rendered.html,/قيد التكوين/);
});
