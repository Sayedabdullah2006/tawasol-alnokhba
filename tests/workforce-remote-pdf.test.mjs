import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createRemoteDB,quote,signature} from './helpers/remote-work-db.mjs';
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
