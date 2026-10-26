import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceDayProgress} from '../src/lib/workforce/attendance-summary.ts';
const day='2026-10-25',at=time=>`${day}T${time}+03:00`,now=Date.parse(at('23:00:00'));
const period=(start,end,extra={})=>({checked_in:at(start),checked_out:at(end),...extra});
test('Monwa screenshot: manual departure after eight hours is a completed day',()=>{
 const result=attendanceDayProgress([period('07:09:03.714','15:09:50.168',{close_reason:'manual'})],day,now);
 assert.equal(result.complete,true);assert.equal(result.remainingMinutes,0);assert.ok(result.seconds>28800);
});
test('completion uses all periods, merges overlaps, excludes gaps, unpaid breaks and overtime',()=>{
 const rows=[period('09:00:00','13:00:00'),period('12:00:00','14:00:00'),period('15:00:00','18:00:00')];
 assert.equal(attendanceDayProgress(rows,day,now).complete,true);
 rows[2].unpaid_periods=[{start:at('16:00:00'),end:at('16:30:00')}];
 rows.push(period('18:00:00','20:00:00',{overtime_request_id:'approved'}));
 assert.deepEqual(attendanceDayProgress(rows,day,now),{seconds:27000,complete:false,remainingMinutes:30});
});
test('legacy completion labels and departure reasons never determine daily completion',()=>{
 for(const close_reason of [null,'manual','day_end','connection_lost','confirmation_missed']){
  assert.equal(attendanceDayProgress([period('09:00:00','12:00:00',{close_reason})],day,now).complete,false);
 }
 assert.equal(attendanceDayProgress([period('09:00:00','16:59:59')],day,now).remainingMinutes,1);
 assert.equal(attendanceDayProgress([period('09:00:00','16:59:59')],day,now,420).complete,true);
});
