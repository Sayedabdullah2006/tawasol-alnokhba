import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  OFFICE_AGENTS,
  parseBrief,
  stepsFor,
} from "../src/lib/virtual-office/domain.ts";

test("office accepts bounded work briefs and keeps its six-role host-independent contract", () => {
  assert.equal(new Set(OFFICE_AGENTS.map((a) => a.id)).size, 6);
  const valid = {
    agentId: "writer",
    kind: "task",
    brief: "جهز قصة موثقة",
    project: "First1Saudi",
    requestId: randomUUID(),
    sourceUrls: ["https://example.com/source"],
  };
  assert.equal(parseBrief(valid).sourceUrls[0], "https://example.com/source");
  for (const change of [
    { agentId: "admin" },
    { kind: "shell" },
    { brief: "  " },
    { brief: "ا".repeat(12001) },
    { sourceUrls: ["javascript:alert(1)"] },
    { sourceUrls: Array(9).fill("https://example.com") },
    { requestId: "bad" },
    { project: "ا".repeat(121) },
  ])
    assert.throws(() => parseBrief({ ...valid, ...change }));
  assert.deepEqual(stepsFor("task", "art"), ["art"]);
  assert.deepEqual(stepsFor("meeting", "editor"), [
    "editor",
    "researcher",
    "writer",
    "art",
    "reviewer",
    "publisher",
    "editor",
  ]);
});

test("durable queue, cancellation fencing, continuation, retry, idempotence and RLS", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;
      create table public.profiles(id uuid primary key,role text); grant select on public.profiles to authenticated,service_role;
      create table public.wf_employees(id uuid primary key);
      insert into public.wf_employees values('00000000-0000-4000-8000-000000000004');
      insert into public.profiles values('00000000-0000-4000-8000-000000000001','admin'),('00000000-0000-4000-8000-000000000002','employee'),('00000000-0000-4000-8000-000000000003','client');`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261122143638_virtual_office.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261122150909_virtual_office_staff_avatars.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261122171631_virtual_office_handoffs.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      "insert into public.vo_staff_avatars(workspace_id,employee_id,preset,updated_by) values('qa','00000000-0000-4000-8000-000000000004','hijab','00000000-0000-4000-8000-000000000001')",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261122175659_virtual_office_adaptive_plans.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(await readFile(new URL('../supabase/migrations/20261122195000_virtual_office_departments.sql',import.meta.url),'utf8'));
    const submit = async (req = randomUUID(), brief = "اختبار خطة تحرير") =>
      (
        await db.query(
          `select (public.vo_submit('qa','00000000-0000-4000-8000-000000000001',$1,'editor','team',$2,'{"project":"QA","sourceText":"","sourceUrls":[]}')).*`,
          [req, brief],
        )
      ).rows[0];
    const claim = async () =>
      (await db.query(`select * from public.vo_claim('qa')`)).rows[0];
    const act = async (id, action, request = randomUUID(), content = "") =>
      (
        await db.query(
          `select (public.vo_session_action('qa',$1,$2,$3,$4)).*`,
          [id, action, request, content],
        )
      ).rows[0];
    const finish = async (row, agent = "editor") =>
      (
        await db.query(
          `select public.vo_finish_step($1,$2,$3,'نتيجة موثقة','[]',10,20,7) as ok`,
          [row.id, row.lease_token, agent],
        )
      ).rows[0].ok;
    const req = randomUUID(),
      first = await submit(req);
    assert.equal((await submit(req)).id, first.id);
    await assert.rejects(() => submit(req, "طلب مختلف"));
    const claimed = await claim();
    assert.equal(claimed.id, first.id);
    assert.equal(await claim(), undefined);
    assert.equal(await finish(claimed), true);
    assert.equal(
      await finish(claimed),
      false,
      "a completed stage cannot write twice",
    );
    assert.equal(
      await claim(),
      undefined,
      "the worker cannot start the next stage before editor approval",
    );
    assert.equal(
      (
        await db.query("select status from public.vo_sessions where id=$1", [
          first.id,
        ])
      ).rows[0].status,
      "handoff",
    );
    await assert.rejects(
      () => act(first.id, "approve_handoff", randomUUID(), "2"),
      "a stale approval must not advance a different stage",
    );
    await act(first.id, "cancel");
    assert.equal(
      (await act(first.id, "retry")).status,
      "handoff",
      "cancel/retry cannot bypass approval",
    );
    assert.equal(await claim(), undefined);
    const approvalId = randomUUID();
    await act(first.id, "approve_handoff", approvalId, "1");
    let next = await claim();
    await act(first.id, "approve_handoff", approvalId, "1");
    assert.equal(next.step, 1);
    await act(first.id, "cancel");
    assert.equal(
      await finish(next, "researcher"),
      false,
      "cancel fences late provider output",
    );
    await act(first.id, "retry");
    next = await claim();
    assert.equal(next.step, 1, "retry resumes after durable output");
    await db.query(
      `update public.vo_sessions set lease_until=now()-interval '1 second' where id=$1`,
      [first.id],
    );
    const recovered = await claim();
    assert.notEqual(recovered.lease_token, next.lease_token);
    assert.equal(
      await finish(next, "researcher"),
      false,
      "old lease cannot write after restart",
    );
    assert.equal(await finish(recovered, "researcher"), true);
    let step = 2;
    for (const role of ["writer", "art", "reviewer", "publisher", "editor"]) {
      assert.equal(await claim(), undefined);
      await act(first.id, "approve_handoff", randomUUID(), String(step++));
      assert.equal(await finish(await claim(), role), true);
    }
    assert.equal(
      (
        await db.query("select status from public.vo_sessions where id=$1", [
          first.id,
        ])
      ).rows[0].status,
      "review",
    );
    assert.equal((await act(first.id, "approve")).status, "completed");
    const followReq = randomUUID();
    assert.equal(
      (await act(first.id, "reply", followReq, "عدّل النسخة وفق المصادر"))
        .revision,
      1,
    );
    assert.equal(
      (await act(first.id, "reply", followReq, "عدّل النسخة وفق المصادر"))
        .revision,
      1,
      "retried follow-up is not duplicated",
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.vo_messages where session_id=$1 and kind='assistant'`,
          [first.id],
        )
      ).rows[0].n,
      7,
    );
    // Adaptive sessions use the editor only until an exact version of the plan is approved.
    const specialistIds = [
      "researcher",
      "writer",
      "art",
      "reviewer",
      "publisher",
    ];
    const planFor = (roles) => ({
      summary: "هذه خطة محددة حسب طبيعة الطلب",
      steps: roles.map((agentId) => ({
        agentId,
        reason: "هذا التخصص مطلوب لهذا الطلب",
        instruction: "أنجز المساهمة المحددة في هذا الطلب",
        deliverable: "تسليم واضح قابل للمراجعة",
      })),
      excluded: specialistIds
        .filter((id) => !roles.includes(id))
        .map((agentId) => ({
          agentId,
          reason: "هذا التخصص غير مطلوب في نطاق الطلب",
        })),
    });
    const adaptiveSubmit = async () =>
      (
        await db.query(
          `select (public.vo_submit('qa-adaptive','00000000-0000-4000-8000-000000000001',$1,'editor','team','جهز توجيه تصميم لنص معتمد','{"workflow":"adaptive-v1","project":"QA","sourceText":"","sourceUrls":[]}')).*`,
          [randomUUID()],
        )
      ).rows[0];
    const adaptiveClaim = async () =>
      (await db.query("select * from public.vo_claim_v3('qa-adaptive')"))
        .rows[0];
    const adaptiveAct = async (id, action, body = {}, request = randomUUID()) =>
      (
        await db.query(
          `select (public.vo_session_action('qa-adaptive',$1,$2,$3,$4)).*`,
          [id, action, request, JSON.stringify(body)],
        )
      ).rows[0];
    const savePlan = async (row, plan) =>
      (
        await db.query(
          `select public.vo_save_plan($1,$2,$3,'خطة تنتظر موافقتك',10,20) as ok`,
          [row.id, row.lease_token, JSON.stringify(plan)],
        )
      ).rows[0].ok;
    const adaptive = await adaptiveSubmit();
    assert.equal(adaptive.workflow, "adaptive");
    assert.equal(
      (await db.query("select * from public.vo_claim('qa-adaptive')")).rows
        .length,
      0,
      "old workers never claim adaptive sessions",
    );
    const planning = await adaptiveClaim();
    await assert.rejects(() =>
      savePlan(planning, {
        ...planFor(["writer"]),
        steps: [...planFor(["writer"]).steps, ...planFor(["writer"]).steps],
      }),
    );
    assert.equal(await savePlan(planning, planFor(["writer"])), true);
    assert.equal(
      await adaptiveClaim(),
      undefined,
      "no execution before plan approval",
    );
    await assert.rejects(() =>
      adaptiveAct(adaptive.id, "approve_handoff", { step: 1, planVersion: 1 }),
    );
    await adaptiveAct(adaptive.id, "cancel");
    assert.equal(
      (await adaptiveAct(adaptive.id, "retry")).status,
      "plan_review",
      "cancel/retry preserves the plan approval gate",
    );
    const revised = await adaptiveAct(adaptive.id, "revise_plan", {
      planVersion: 1,
      notes: "استبعد الكتابة؛ نحتاج التوجيه الفني فقط",
    });
    assert.equal(revised.plan, null);
    assert.equal(revised.step, 0);
    assert.equal(
      await savePlan(planning, planFor(["writer"])),
      false,
      "late planning output cannot replace a revised plan",
    );
    const replan = await adaptiveClaim();
    assert.equal(await savePlan(replan, planFor(["art"])), true);
    await assert.rejects(
      () => adaptiveAct(adaptive.id, "approve_plan", { planVersion: 1 }),
      "old approval must not approve revised roles",
    );
    const approveId = randomUUID();
    const approved = await adaptiveAct(
      adaptive.id,
      "approve_plan",
      { planVersion: 2 },
      approveId,
    );
    assert.equal(approved.approved_plan_version, 2);
    assert.equal(
      (await db.query("select * from public.vo_claim('qa-adaptive')")).rows
        .length,
      0,
    );
    const artist = await adaptiveClaim();
    assert.equal(artist.step, 1);
    await adaptiveAct(
      adaptive.id,
      "approve_plan",
      { planVersion: 2 },
      approveId,
    );
    await assert.rejects(() =>
      db.query(
        `select public.vo_finish_step($1,$2,'writer','غير مسموح','[]',1,1,3)`,
        [artist.id, artist.lease_token],
      ),
    );
    await assert.rejects(() =>
      db.query(
        `select public.vo_finish_step($1,$2,'art','عدد خاطئ','[]',1,1,7)`,
        [artist.id, artist.lease_token],
      ),
    );
    assert.equal(
      (
        await db.query(
          `select public.vo_finish_step($1,$2,'art','التوجيه الفني جاهز','[]',1,1,3) as ok`,
          [artist.id, artist.lease_token],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      await adaptiveClaim(),
      undefined,
      "chosen stages still require handoff approval",
    );
    await assert.rejects(() =>
      adaptiveAct(adaptive.id, "approve_handoff", { planVersion: 1, step: 2 }),
    );
    await adaptiveAct(adaptive.id, "approve_handoff", {
      planVersion: 2,
      step: 2,
    });
    const finalEditor = await adaptiveClaim();
    assert.equal(finalEditor.step, 2);
    await db.query(
      `select public.vo_finish_step($1,$2,'editor','الخلاصة النهائية','[]',1,1,3)`,
      [finalEditor.id, finalEditor.lease_token],
    );
    assert.deepEqual(
      (
        await db.query(
          `select agent_id from public.vo_messages where session_id=$1 and kind='assistant' order by created_at`,
          [adaptive.id],
        )
      ).rows.map((m) => m.agent_id),
      ["editor", "editor", "art", "editor"],
    );
    assert.equal(
      (await adaptiveAct(adaptive.id, "approve")).status,
      "completed",
    );
    // A request that needs only the editor can omit all five specialist roles.
    const editorialOnly = await adaptiveSubmit(),
      editorPlan = await adaptiveClaim();
    await savePlan(editorPlan, planFor([]));
    await adaptiveAct(editorialOnly.id, "approve_plan", { planVersion: 1 });
    const editorialWork = await adaptiveClaim();
    await db.query(
      `select public.vo_finish_step($1,$2,'editor','استشارة تحريرية جاهزة','[]',1,1,2)`,
      [editorialWork.id, editorialWork.lease_token],
    );
    assert.equal(
      (
        await db.query("select status from public.vo_sessions where id=$1", [
          editorialOnly.id,
        ])
      ).rows[0].status,
      "review",
    );
    await db.query(
      "delete from public.vo_sessions where workspace_id='qa-adaptive'",
    );
    const departmental=async(scope,department)=>(await db.query(`select (public.vo_submit($1,'00000000-0000-4000-8000-000000000001',$2,'editor','chat','جهز ملخصًا من البيانات المرفقة',$3)).*`,[scope,randomUUID(),JSON.stringify({project:'QA',sourceText:'',sourceUrls:[],department})])).rows[0];
    const financial=await departmental('qa-company:department:finance','finance'),hr=await departmental('qa-company:department:people','people');
    const claimDepartments=async(scopes)=>(await db.query('select * from public.vo_claim_departments($1::text[])',[scopes])).rows[0];
    const fc=await claimDepartments(['qa-empty','qa-company:department:finance','qa-company:department:people']);assert.equal(fc.id,financial.id);assert.equal(fc.context.department,'finance');
    const hc=await claimDepartments(['qa-company:department:finance','qa-company:department:people']);assert.equal(hc.id,hr.id);assert.equal(hc.context.department,'people');
    assert.equal(await claimDepartments(['qa-company:department:finance','qa-company:department:people']),undefined);
    for(const c of [fc,hc])await db.query(`select public.vo_finish_step($1,$2,'editor','ملخص الإدارة جاهز','[]',1,1,1)`,[c.id,c.lease_token]);
    assert.notEqual((await db.query('select workspace_id from public.vo_sessions where id=$1',[fc.id])).rows[0].workspace_id,(await db.query('select workspace_id from public.vo_sessions where id=$1',[hc.id])).rows[0].workspace_id);
    await assert.rejects(()=>claimDepartments([]));await assert.rejects(()=>claimDepartments(Array(9).fill('qa-company')));
    await db.query('delete from public.vo_sessions where id=any($1::uuid[])',[[fc.id,hc.id]]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);`,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.vo_sessions"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.vo_messages"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.vo_staff_avatars"))
        .rows[0].n,
      0,
    );
    await assert.rejects(() =>
      db.query("update public.vo_staff_avatars set preset='shemagh'"),
    );
    await assert.rejects(() => db.query(`select * from public.vo_claim('qa')`));
    await assert.rejects(() =>
      db.query(`select * from public.vo_claim_v3('qa')`),
    );
    await assert.rejects(()=>db.query("select * from public.vo_claim_departments(array['qa'])"));
    await assert.rejects(() =>
      db.query(`update public.vo_sessions set status='completed'`),
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);`,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.vo_sessions"))
        .rows[0].n,
      0,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.vo_sessions"))
        .rows[0].n,
      1,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(() => db.query("select * from public.vo_sessions"));
  } finally {
    await db.close();
  }
});
