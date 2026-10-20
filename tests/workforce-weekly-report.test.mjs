import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFeedback,renderWorkforceEmail,workforceMailCC} from '../supabase/functions/_shared/workforce-email.ts';
const report={periodStart:'2026-10-17',periodEnd:'2026-10-23',asOf:'2026-10-23T21:00:00Z',month:'2026-10',completed:2,unfinished:3,pendingReview:1,overdue:0,onTime:2,lateSubmissions:0,changesCount:0,repeatedChanges:0,weekWorkedMinutes:2400,weekRequiredMinutes:2400,monthWorkedMinutes:3000,openTasks:[]};
test('feedback recognizes on-time delivery and working hours without inventing quality scores',()=>{
 const text=weeklyFeedback(report).join('\n');assert.match(text,/أحسنتِ/);assert.match(text,/ضمن موعدها/);assert.match(text,/لم تُحسب ضمن المهام المتأخرة/);assert.doesNotMatch(text,/الفارق|ضعيف|عقوبة|خصم/);
});
test('short hours, late tasks and repeated revisions produce respectful actionable feedback',()=>{
 const text=weeklyFeedback({...report,weekWorkedMinutes:2100,overdue:1,lateSubmissions:1,repeatedChanges:2,changesCount:4}).join('\n');
 assert.match(text,/الفارق 5 س 0 د/);assert.match(text,/نحن هنا لدعمك/);assert.match(text,/قائمة تحقق/);assert.match(text,/العوائق/);assert.doesNotMatch(text,/رائع|فاشل|عقوبة|خصم/);
});
test('no due-date evidence produces a neutral message, and leave-only weeks no hours warning',()=>{
 const text=weeklyFeedback({...report,onTime:0,lateSubmissions:0,weekRequiredMinutes:0,weekWorkedMinutes:0}).join('\n');assert.match(text,/لا توجد تسليمات مؤرخة كافية/);assert.doesNotMatch(text,/الفارق|تحقيق مستهدف ساعات/);
});
test('weekly HTML is branded, escaped and has one authorized manager CC only',()=>{
 const mail={email:'employee@example.com',name:'<نور>',kind:'weekly_report',title:'التقرير الأسبوعي',href:'/employee',createdAt:report.asOf,cc:['other@example.com','elitecnnct@gmail.com'],weeklyReport:{...report,openTasks:[{title:'<script>bad</script>',dueAt:null,pendingReview:true}]}};
 const rendered=renderWorkforceEmail(mail);assert.match(rendered.html,/logo.png/);assert.match(rendered.html,/&lt;نور&gt;/);assert.doesNotMatch(rendered.html,/<script>/);assert.match(rendered.text,/ساعات العمل التراكمية/);assert.deepEqual(workforceMailCC(mail),['elitecnnct@gmail.com']);
 assert.equal(workforceMailCC({...mail,kind:'assigned'}),undefined);assert.equal(workforceMailCC({...mail,email:'elitecnnct@gmail.com'}),undefined);
 assert.throws(()=>renderWorkforceEmail({...mail,weeklyReport:undefined}),/snapshot missing/);
});
