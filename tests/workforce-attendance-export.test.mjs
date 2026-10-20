import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import {attendanceWorkbook,attendanceExportPeriods} from '../src/lib/workforce/attendance-export.ts';
import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';

test('historical month clips overnight periods and overlapping corrections once',()=>{
 const periods=[{checked_in:'2026-09-30T23:00:00+03:00',checked_out:'2026-10-01T02:00:00+03:00'},{checked_in:'2026-10-01T01:00:00+03:00',checked_out:'2026-10-01T03:00:00+03:00'}];
 const summary=summarizeAttendance({periods,startDate:'2026-09-01',month:'2026-10',now:new Date('2026-11-04T12:00:00+03:00')});
 assert.deepEqual(attendanceExportPeriods(periods,summary).map(p=>p.seconds),[7200,3600]);
 assert.equal(summary.workedMinutes,180);
});
test('XLSX preserves numeric durations, Arabic layout, and names as literal strings',async()=>{
 const now=new Date('2026-10-21T12:00:00+03:00'),periods=[{checked_in:'2026-10-20T08:00:00+03:00',checked_out:'2026-10-20T16:00:00+03:00'}];
 const summary=summarizeAttendance({periods,startDate:'2026-10-20',month:'2026-10',now});
 const bytes=await attendanceWorkbook('2026-10',[{full_name:'=1+1',job_title:'موظفة',start_date:'2026-10-20',summary,periods}],now);
 assert.equal(Buffer.from(bytes).subarray(0,2).toString(),'PK');
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(bytes));
 assert.equal(book.worksheets.length,2);
 const sheet=book.getWorksheet('ملخص الموظفات'),detail=book.getWorksheet('فترات الحضور والانصراف');
 const duration=cell=>cell.value instanceof Date?cell.value.getTime()/86400000+25569:cell.value;
 assert.equal(sheet.getCell('A5').value,'=1+1');assert.ok(Math.abs(duration(sheet.getCell('F5'))-80/24)<1e-8);
 assert.ok(Math.abs(duration(sheet.getCell('G5'))-8/24)<1e-8);assert.ok(Math.abs(duration(sheet.getCell('H5'))-72/24)<1e-8);
 assert.equal(sheet.getCell('G5').numFmt,'[h]:mm');assert.equal(sheet.views[0].rightToLeft,true);
 assert.equal(detail.getCell('B5').value,'2026-10-20 08:00:00');assert.ok(Math.abs(duration(detail.getCell('D5'))-8/24)<1e-8);
});
test('month before joining has no target; open periods stop at export time or correction limit',()=>{
 const now=new Date('2026-10-21T12:00:00+03:00');
 const old=summarizeAttendance({periods:[],startDate:'2026-10-20',month:'2026-09',now});
 assert.equal(old.targetMinutes,0);assert.equal(old.remainingMinutes,0);
 const periods=[{checked_in:'2026-10-19T12:00:00+03:00',checked_out:null}];
 const s=summarizeAttendance({periods,startDate:'2026-10-18',month:'2026-10',now});
 assert.equal(attendanceExportPeriods(periods,s)[0].seconds,86400);
});
