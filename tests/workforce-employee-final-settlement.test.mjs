import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ownFinalSettlements, employeeSettlement} from '../src/lib/workforce/employee-final-settlement.ts';
import {createSettlementDB, ids, accept, settlement, setTime} from './helpers/settlement-db.mjs';

const reviewed = {variable_monthly:'0.00',variable_policy:'include',exception:'ordinary',adjustments:[],wage_reviewed:true};
function adapter(db, queries) {
  return {from(table) {
    assert.equal(table, 'wf_final_settlements');
    const filters = {};
    return {
      select(columns) {assert.equal(columns, 'id,employee_id,status,snapshot,approved_at,paid_at,payment_reference'); return this;},
      eq(key, value) {assert.equal(key, 'employee_id'); filters.employee = value; return this;},
      in(key, value) {assert.equal(key, 'status'); assert.deepEqual(value, ['approved', 'paid']); return this;},
      async order(key, options) {
        assert.equal(key, 'approved_at'); assert.equal(options.ascending, false);
        queries.push(filters.employee);
        return {data: (await db.query("select id,employee_id,status,snapshot,approved_at::text,paid_at::text,payment_reference from wf_final_settlements where employee_id=$1 and status in ('approved','paid') order by approved_at desc", [filters.employee])).rows, error: null};
      },
    };
  }};
}
const actor = employee => ({role: 'employee', employee: {id: employee}, canManageTasks: true});

test('own read publishes approved snapshots and payment reference, never drafts or another employee; reopening hides it', async () => {
  const db = await createSettlementDB();
  try {
    const queries = [], client = adapter(db, queries);
    for (const employee of [ids.en, ids.em]) {
      await db.exec('reset role');
      await db.query("insert into workforce_private.payroll_attendance_waivers values($1,'2026-10-01','إعفاء أكتوبر')", [employee]);
      await db.exec('set role service_role');
    }
    const noorRequest = await accept(db, ids.en), monwaRequest = await accept(db, ids.em);
    await setTime(db, '2026-10-28T12:00:00+03:00');
    assert.deepEqual(await ownFinalSettlements(actor(ids.en), client), []);
    assert.deepEqual(await ownFinalSettlements(actor(ids.em), client), []);
    const q = (await settlement(db, noorRequest, 'quote', 0, {inputs: reviewed})).quote;
    await settlement(db, noorRequest, 'approve', 0, {inputs: reviewed, expected_hash: q.hash});
    const before = await ownFinalSettlements(actor(ids.en), client);
    assert.equal(before.length, 1);
    assert.equal(before[0].net_due, q.net_due);
    assert.equal(before[0].status, 'approved');
    assert.equal(before[0].payment_reference, null);
    assert.deepEqual(await ownFinalSettlements(actor(ids.em), client), []);
    assert.ok(!JSON.stringify(before).includes('expected_hash'));
    assert.ok(!('inputs' in before[0]));
    assert.ok(!('approved_by' in before[0]));
    assert.ok(!('hash' in before[0]));
    await settlement(db, noorRequest, 'pay', 1, {reference:'BANK-FINAL-001'});
    const paid = await ownFinalSettlements(actor(ids.en), client);
    assert.equal(paid[0].status, 'paid');
    assert.equal(paid[0].net_due, before[0].net_due);
    assert.equal(paid[0].payment_reference, 'BANK-FINAL-001');
    assert.ok(paid[0].paid_at);
    assert.deepEqual(await ownFinalSettlements(actor(ids.em), client), []);
    const mq = (await settlement(db, monwaRequest, 'quote', 0, {inputs:reviewed})).quote;
    await settlement(db, monwaRequest, 'approve', 0, {inputs:reviewed,expected_hash:mq.hash});
    assert.equal((await ownFinalSettlements(actor(ids.em), client))[0].net_due, mq.net_due);
    assert.equal((await ownFinalSettlements(actor(ids.en), client))[0].net_due, q.net_due);
    await settlement(db, monwaRequest, 'reopen', 1);
    assert.deepEqual(await ownFinalSettlements(actor(ids.em), client), []);
    // Repeated GET-equivalent reads have no write or notification side effects.
    const state = async () => (await db.query("select (select count(*)::int from wf_final_settlement_events) events, (select count(*)::int from wf_payroll_payments) payments, (select count(*)::int from wf_notifications) notifications, (select sum(version) from wf_monthly_payroll)::text versions")).rows[0];
    const saved = await state();
    for (let i=0;i<3;i++) await ownFinalSettlements(actor(ids.en), client);
    assert.deepEqual(await state(), saved);
    assert.equal(saved.notifications, 0);
    assert.ok(queries.every(id => [ids.en, ids.em].includes(id)));
    // Employee cannot mutate using the manager RPC, even after publication.
    await assert.rejects(settlement(db,noorRequest,'pay',2,{reference:'DUPLICATE'},crypto.randomUUID(),ids.noor));
  } finally { await db.close(); }
});

test('identity is required; delegated managers get only their own record; internal fields are not published', async () => {
  const forbiddenClient = {from() {throw Error('must not query');}};
  await assert.rejects(ownFinalSettlements({role:'admin',employee:null},forbiddenClient), /الملف غير متاح/);
  await assert.rejects(ownFinalSettlements({role:'employee',employee:null},forbiddenClient), /الملف غير متاح/);
  assert.equal(employeeSettlement({employee_id:ids.em,status:'approved'},ids.en),null);
  assert.equal(employeeSettlement({employee_id:ids.en,status:'draft'},ids.en),null);
  assert.throws(()=>employeeSettlement({employee_id:ids.en,status:'approved',snapshot:{employee_id:ids.em}},ids.en),/تعذر قراءة/);
  const api = await readFile(new URL('../src/app/api/workforce/my-final-settlements/route.ts',import.meta.url),'utf8');
  assert.match(api,/export async function GET\(\)/);
  assert.doesNotMatch(api,/export async function (POST|PUT|PATCH|DELETE)|searchParams|\.rpc\(/);
  const view = await readFile(new URL('../src/components/workforce/EmployeeFinalSettlements.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(view,/<(?:Button|input|form)\b|method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});
