import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createRemoteDB,quote,signature,submit,approve,ids} from './helpers/remote-work-db.mjs';
import {renderRemoteAgreement} from '../src/lib/workforce/remote-work-pdf.ts';

test('agreement stays one A4 page before and after signature, with overflow rejected rather than clipped',async()=>{
 const db=await createRemoteDB();try{
  const q=await quote(db);
  for(const signed of [false,true]){
   const bytes=await renderRemoteAgreement(q,signed?signature:[],signed?'2026-10-28T09:00:00+03:00':undefined,signed?{status:'approved',at:'2026-10-28T09:10:00+03:00',reason:null}:undefined,true);
   const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.ok(Math.abs(pdf.getPage(0).getWidth()-595.28)<.01);assert.ok(Math.abs(pdf.getPage(0).getHeight()-841.89)<.01);
  }
  await assert.rejects(renderRemoteAgreement({...q,duties:'تفاصيل '.repeat(800)}),/الصفحة الواحدة/);
 }finally{await db.close();}
});

test('manager PDF is rendered from the immutable signature and timestamp saved with the approved request',async()=>{
 const db=await createRemoteDB();try{
  const q=await quote(db),id=await submit(db,q);await approve(db,id);
  const row=(await db.query('select remote_details,status,decided_at,decision_reason from wf_employee_requests where id=$1',[id])).rows[0];
  const d=row.remote_details;assert.deepEqual(d.signature,signature);assert.equal(d.signed_by,ids.noor);assert.ok(d.signed_at);
  const pdf=await PDFDocument.load(await renderRemoteAgreement(d.snapshot,d.signature,d.signed_at,{status:row.status,at:row.decided_at,reason:row.decision_reason},true));
  assert.equal(pdf.getPageCount(),1);assert.equal(row.status,'approved');assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});
