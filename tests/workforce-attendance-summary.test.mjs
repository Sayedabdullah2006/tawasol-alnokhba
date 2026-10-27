import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAttendance, liveAttendance, attendanceDuration} from '../src/lib/workforce/attendance-summary.ts';
const at=(day,time)=>`${day}T${time}:00+03:00`;
const period=(day,start,end)=>({checked_in:at(day,start),checked_out:end?at(day,end):null});
const make=(overrides={})=>summarizeAttendance({periods:[],startDate:'2026-10-18',month:'2026-10',now:new Date(at('2026-10-21','18:00')),...overrides});

test('partial October targets count six workdays, exclude Fridays and respect joining dates',()=>{
 assert.equal(make().targetMinutes,96*60);
 assert.equal(make({startDate:'2026-10-20'}).targetMinutes,80*60);
 assert.equal(make({startDate:'2026-11-01'}).targetMinutes,0);
 assert.equal(make({startDate:'2026-09-01'}).targetMinutes,208*60);
 assert.equal(make({startDate:'2026-10-30'}).workdayCount,1);
});
test('all periods on a day count, while breaks never count',()=>{
 const result=make({periods:[period('2026-10-21','08:00','10:00'),period('2026-10-21','11:00','13:30'),period('2026-10-21','15:00','16:15')]});
 assert.equal(result.todayMinutes,345);assert.equal(result.workedMinutes,345);
 assert.equal(result.todayPeriods,3);assert.equal(attendanceDuration(result.todayMinutes),'5 س 45 د');
 assert.equal(result.remainingMinutes,96*60-345);
});
test('closed sessions do not grow, and an active new period grows from its own start',()=>{
 const now=new Date(at('2026-10-21','10:30'));
 const open={checked_in:at('2026-10-21','10:00')};
 const result=make({now,periods:[period('2026-10-21','08:00','09:00'),{...open,checked_out:null}]});
 assert.equal(result.todayMinutes,90);
 assert.equal(liveAttendance(result,open,new Date(at('2026-10-21','11:00')).getTime()).todayMinutes,120);
 assert.equal(liveAttendance(result,null,new Date(at('2026-10-21','11:00')).getTime()).todayMinutes,90);
});
test('round after adding all seconds and merge overlapping corrected sessions',()=>{
 assert.equal(make({periods:[{checked_in:at('2026-10-21','08:00'),checked_out:'2026-10-21T08:00:40+03:00'},{checked_in:at('2026-10-21','09:00'),checked_out:'2026-10-21T09:00:40+03:00'}]}).todayMinutes,1);
 assert.equal(make({periods:[period('2026-10-21','08:00','10:00'),period('2026-10-21','09:00','11:00')]}).todayMinutes,180);
});
test('overnight periods split by Riyadh calendar day and month',()=>{
 const result=make({month:'2026-11',startDate:'2026-10-18',now:new Date(at('2026-11-01','03:00')),periods:[{checked_in:at('2026-10-31','23:00'),checked_out:at('2026-11-01','02:00')}]});
 assert.equal(result.workedMinutes,120);assert.equal(result.todayMinutes,120);
 assert.equal(make({now:new Date(at('2026-10-21','02:00')),periods:[{checked_in:at('2026-10-20','23:00'),checked_out:at('2026-10-21','01:00')}]}).todayMinutes,60);
});
test('ignore time before joining and after now; do not cap genuine worked time at eight hours',()=>{
 const result=make({startDate:'2026-10-21',periods:[period('2026-10-20','08:00','16:00'),period('2026-10-21','06:00','20:00')]});
 assert.equal(result.workedMinutes,12*60);assert.equal(result.todayMinutes,12*60);
 const extra=make({startDate:'2026-10-31',now:new Date(at('2026-10-31','20:00')),periods:[period('2026-10-31','08:00','18:00')]});
 assert.equal(extra.remainingMinutes,0);assert.equal(extra.extraMinutes,120);
});
test('a forgotten open session stops at the 24-hour correction boundary',()=>{
 const open={checked_in:at('2026-10-19','08:00')};
 const result=make({periods:[{...open,checked_out:null}]});
 assert.equal(result.workedMinutes,24*60);assert.equal(result.todayMinutes,0);
 assert.equal(liveAttendance(result,open,new Date(at('2026-10-22','18:00')).getTime()).workedMinutes,24*60);
 assert.equal(liveAttendance(result,open,new Date(at('2026-10-22','18:00')).getTime()).needsCorrection,true);
});
test('employment ending caps monthly targets and live credit while keeping past attendance',()=>{
 const summary=make({endDate:'2026-10-20',now:new Date(at('2026-10-22','12:00')),periods:[period('2026-10-20','09:00','17:00'),period('2026-10-21','09:00','17:00')]});
 assert.equal(summary.targetMinutes,3*8*60);assert.equal(summary.workedMinutes,8*60);assert.equal(summary.employmentEnded,true);assert.equal(summary.dayOff,true);
 const live=liveAttendance(summary,period('2026-10-22','09:00',null),Date.parse(at('2026-10-22','16:00')));assert.equal(live.workedMinutes,8*60);assert.equal(live.isPresent,false);
 const later=make({endDate:'2026-10-20',month:'2026-11',now:new Date(at('2026-11-01','12:00'))});assert.equal(later.targetMinutes,0);assert.equal(later.remainingMinutes,0);
});
