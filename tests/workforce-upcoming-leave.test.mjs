import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingLeave,leaveDate} from '../src/lib/workforce/upcoming-leave.ts';

const base={employeeId:'noor',startDate:'2026-10-18',today:'2026-10-23',calendar:[],requests:[]};
const request=(id,extra={})=>({id,employee_id:'noor',title:'إجازة خاصة',kind:'leave',status:'approved',leave_type:'paid',starts_at:'2026-10-25T00:00:00+03:00',ends_at:'2026-10-27T23:59:00+03:00',test_run_id:null,...extra});

test('upcoming holidays include next year, group Eid dates, keep compensation separate and sort nearest first',()=>{
 const calendar=Array.from({length:5},(_,i)=>({day:`2027-03-${String(9+i).padStart(2,'0')}`,title:'عيد الفطر'}));
 calendar.push({day:'2027-03-14',title:'تعويض الجمعة'},{day:'2026-09-23',title:'قديم'});
 const rows=upcomingLeave({...base,calendar,requests:[request('leave')]});
 assert.equal(rows[0].id,'request:leave');
 const eid=rows.find(x=>x.title==='عيد الفطر');assert.equal(eid.starts_on,'2027-03-09');assert.equal(eid.ends_on,'2027-03-13');assert.equal(eid.paid,true);
 assert.equal(rows.filter(x=>x.title==='عيد الفطر').length,1);
 assert.ok(rows.some(x=>x.title==='تعويض الجمعة'&&x.starts_on==='2027-03-14'));
 assert.ok(rows.some(x=>x.starts_on==='2027-02-22'&&x.paid));assert.ok(rows.some(x=>x.starts_on==='2027-09-23'));
 assert.ok(rows.every(x=>x.ends_on>=base.today));
 assert.deepEqual(rows.map(x=>x.starts_on),rows.map(x=>x.starts_on).sort());
});

test('only the selected employee sees approved personal leave; unpaid remains unpaid and test rows stay hidden',()=>{
 const requests=[request('paid'),request('unpaid',{leave_type:'unpaid'}),request('other',{employee_id:'monwa'}),request('pending',{status:'pending'}),request('rejected',{status:'rejected'}),request('cancelled',{status:'cancelled'}),request('test',{test_run_id:'silent-test'}),request('remote',{kind:'remote-work'}),request('invalid',{starts_at:'bad'}),request('reverse',{starts_at:'2026-11-01'}),request('missing',{ends_at:null}),request('paid')];
 const personal=upcomingLeave({...base,requests}).filter(x=>x.source==='request');
 assert.deepEqual(personal.map(x=>x.id),['request:paid','request:unpaid']);assert.equal(personal[0].paid,true);assert.equal(personal[1].paid,false);
 assert.deepEqual(upcomingLeave({...base,employeeId:'monwa',requests}).filter(x=>x.source==='request').map(x=>x.id),['request:other']);
});

test('approval adds leave, cancellation removes it, ongoing leave uses Riyadh dates and overlapping holidays stay separate',()=>{
 const q=request('ongoing',{status:'pending',starts_at:'2026-10-22T21:00:00Z',ends_at:'2026-10-24T20:59:00Z'});
 const calendar=[{day:'2026-10-23',title:'إجازة رسمية'}];
 assert.equal(upcomingLeave({...base,calendar,requests:[q]}).filter(x=>x.source==='request').length,0);
 q.status='approved';let rows=upcomingLeave({...base,calendar,requests:[q]});
 const own=rows.find(x=>x.source==='request');assert.equal(own.starts_on,'2026-10-23');assert.equal(own.ends_on,'2026-10-24');assert.equal(own.ongoing,true);assert.equal(rows.filter(x=>x.starts_on==='2026-10-23').length,2);
 q.status='cancelled';assert.equal(upcomingLeave({...base,calendar,requests:[q]}).filter(x=>x.source==='request').length,0);
 assert.equal(upcomingLeave({...base,startDate:'2026-11-01',calendar,requests:[request('past')]}).filter(x=>x.starts_on<'2026-11-01').length,0);
 assert.match(leaveDate('2027-03-09'),/٢٠٢٧|2027/);
});
