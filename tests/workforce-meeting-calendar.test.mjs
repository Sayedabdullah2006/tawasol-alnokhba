import test from 'node:test';import assert from 'node:assert/strict';
import {calendarMonth,calendarWeek,shiftCalendarMonth,meetingCalendarRange,meetingDay,meetingsOnDay} from '../src/lib/workforce/meeting-calendar.ts';
test('calendar uses Riyadh dates and Saturday weeks across month/year boundaries',()=>{
 assert.equal(meetingDay('2026-10-24T22:00:00Z'),'2026-10-25');
 assert.deepEqual(calendarWeek('2026-11-01'),['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']);
 const days=calendarMonth('2027-01');assert.equal(days.length,42);assert.equal(new Set(days).size,42);assert.equal(days[0],'2026-12-26');
 assert.equal(shiftCalendarMonth('2026-01-31',1),'2026-02-28');assert.equal(shiftCalendarMonth('2028-03-31',-1),'2028-02-29');
 assert.deepEqual(meetingCalendarRange('2026-11'),{from:'2026-10-31T00:00:00+03:00',until:'2026-12-12T00:00:00+03:00'});
 assert.throws(()=>meetingCalendarRange('2026-13'));assert.throws(()=>meetingCalendarRange('2026-01,or(id.not.is.null)'));
});
test('calendar places midnight-spanning events on both days, excludes endpoint and hidden states, and sorts appointments',()=>{
 const event=(id,start,end,status='scheduled')=>({id,starts_at:`2026-10-${start}`,ends_at:`2026-10-${end}`,status});
 const meetings=[event('late','25T14:00:00+03:00','25T15:00:00+03:00'),event('overnight','24T23:00:00+03:00','25T01:00:00+03:00'),event('endpoint','24T23:00:00+03:00','25T00:00:00+03:00'),event('draft','25T09:00:00+03:00','25T10:00:00+03:00','draft'),event('cancel','25T09:00:00+03:00','25T10:00:00+03:00','cancelled')];
 assert.deepEqual(meetingsOnDay(meetings,'2026-10-25').map(m=>m.id),['overnight','late']);
 assert.deepEqual(meetingsOnDay(meetings,'2026-10-24').map(m=>m.id),['endpoint','overnight']);
});
