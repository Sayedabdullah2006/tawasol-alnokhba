import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const root = (n) => new URL("../" + n, import.meta.url);
const code = (s) =>
  ts.transpileModule(s, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const dataUrl = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const dept = dataUrl(
  code(
    await readFile(root("src/lib/virtual-office/departments.ts"), "utf8"),
  ).replace(
    'from "./domain"',
    `from "${root("src/lib/virtual-office/domain.ts").href}"`,
  ),
);
const { hostReadPlan } = await import(
  dataUrl(
    code(
      await readFile(
        root("src/lib/virtual-office/host-read-policy.ts"),
        "utf8",
      ),
    ).replace('from "./departments"', `from "${dept}"`),
  )
);
const session = { context: { department: "finance" } },
  now = new Date("2026-11-22T21:30:00Z");
test("host reads choose the latest requested Riyadh period and preserve external content research", () => {
  assert.equal(
    hostReadPlan(session, "editor", "وكم إجماليها؟", now, ["الفواتير 2026-10"])
      .from,
    "2026-10-01",
  );
  assert.equal(
    hostReadPlan(session, "editor", "وهذا الشهر؟", now, ["الفواتير 2026-10"])
      .from,
    "2026-11-01",
  );
  assert.deepEqual(hostReadPlan(session, "editor", "ما وضعنا اليوم؟", now), {
    department: "finance",
    agent: "editor",
    from: "2026-11-23",
    until: "2026-11-24",
    includeStaff: false,
  });
  assert.equal(
    hostReadPlan(session, "writer", "فواتير الشهر الماضي", now).from,
    "2026-10-01",
  );
  const explicit = hostReadPlan(
    session,
    "writer",
    "الفواتير من ٢٠٢٦-١٠-٠١ إلى ٢٠٢٦-١٠-٣١",
    now,
  );
  assert.equal(explicit.until, "2026-11-01");
  assert.equal(
    hostReadPlan(session, "editor", "ملخص 2026-10", now).until,
    "2026-11-01",
  );
  assert.throws(() =>
    hostReadPlan(session, "editor", "الفواتير 2026-02-30", now),
  );
  assert.throws(() => hostReadPlan(session, "editor", "الفواتير 2026-13", now));
  assert.throws(() =>
    hostReadPlan(session, "editor", "الفواتير 2026-11-32", now),
  );
  assert.equal(
    hostReadPlan(
      { context: { department: "content" } },
      "researcher",
      "تحقق من أول سعودي بمصادر أصلية",
      now,
    ),
    null,
  );
  assert.equal(
    hostReadPlan(
      { context: { department: "marketing" } },
      "researcher",
      "ابحث عن المنافسين في السوق",
      now,
    ),
    null,
  );
  assert.ok(
    hostReadPlan(
      { context: { department: "content" } },
      "publisher",
      "ما المنشورات المجدولة لدينا اليوم؟",
      now,
    ),
  );
  assert.equal(
    hostReadPlan(
      { context: { department: "people" } },
      "researcher",
      "ما حالة الموظفين",
      now,
    ).includeStaff,
    true,
  );
  assert.equal(
    hostReadPlan(
      { context: { department: "marketing" } },
      "editor",
      "أعطني رواتب الموظفين",
      now,
    ).includeStaff,
    false,
  );
});
const uid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
test("real SQL scopes department data, separates financial meanings, deduplicates metrics and rechecks authority", async () => {
  const db = new PGlite(),
    admin = uid(1),
    user = uid(2),
    other = uid(3),
    client = uid(4),
    emp = uid(12),
    peer = uid(13),
    board = uid(20),
    col = uid(21);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema workforce_private;create schema auth;
 create table auth.users(id uuid primary key,banned_until timestamptz);create table profiles(id uuid primary key,role text);
 create table wf_employees(id uuid primary key,user_id uuid,status text,full_name text,can_manage_tasks boolean default false);
 create function workforce_private.work_now() returns timestamptz language sql as $$select '2026-11-23T08:00Z'::timestamptz$$;
 create function workforce_private.task_actor_unbanned(actor uuid) returns boolean language sql as $$select current_setting('role',true)='service_role' and exists(select 1 from auth.users where id=actor and (banned_until is null or banned_until<now()))$$;
 create function workforce_private.can_manage_tasks(actor uuid) returns boolean language sql as $$select exists(select 1 from public.profiles p left join public.wf_employees e on e.user_id=p.id and e.status='active' where p.id=actor and (p.role='admin' or p.role='employee' and e.can_manage_tasks))$$;
 create table wf_boards(id uuid primary key,title text,archived_at timestamptz);create table wf_task_columns(id uuid primary key,kind text);
 create table wf_tasks(id uuid primary key,board_id uuid,column_id uuid,title text,labels text[],assignee_id uuid,co_assignee_ids uuid[] default '{}',archived_at timestamptz,deleted_at timestamptz,test_run_id uuid,completed_at timestamptz,due_at timestamptz,updated_at timestamptz,priority text,blocked_reason text,requires_approval boolean);
 create table service_invoices(id uuid primary key,invoice_number text,status text,amount numeric,currency text,issued_at timestamptz,paid_at timestamptz,updated_at timestamptz,snapshot jsonb);
 create table payment_refunds(status text,amount numeric,processed_at timestamptz,requested_at timestamptz);
 create table wf_monthly_payroll(employee_id uuid,month date,status text,total_amount numeric,paid_amount numeric,updated_at timestamptz);
 create table wf_sales_settings(manager_employee_id uuid);create table wf_sales_months(month date,status text,team_target int);
 create table wf_sales_plans(employee_id uuid,month date,goals jsonb);
 create table wf_crm_accounts(id uuid primary key,name text,owner_id uuid,email text);
 create table wf_crm_opportunities(id uuid primary key,account_id uuid,title text,service text,stage text,value numeric,source_employee_id uuid,next_action text,next_on date,created_at timestamptz);
 create table wf_sales_activities(employee_id uuid,opportunity_id uuid,month date,metric text,status text,amount numeric,occurred_on date);
 create table social_schedule(id uuid primary key,post_title text,category text,status text,batch_date date,created_at timestamptz,design_image_url text);
 create table postpulse_posts(id uuid primary key,status text,scheduled_for timestamptz,created_at timestamptz,updated_at timestamptz,content text,event_raw jsonb);
 create table editorial_items(day date,status text,schedule_state text,updated_at timestamptz);
 create table x_post_metric_snapshots(id bigint primary key,x_post_id text,captured_at timestamptz,public_metrics jsonb,non_public_metrics jsonb);
 create table brand_settings(first1saudi_logo_url text,updated_at timestamptz);
 create table vo_sessions(id uuid primary key,lease_token uuid,status text);create table vo_messages(session_id uuid,message_key text,agent_id text,kind text,content text,citations jsonb,unique(session_id,message_key));
 insert into profiles values('${admin}','admin'),('${user}','employee'),('${other}','employee'),('${client}','client');insert into auth.users select id,null from profiles;
 insert into wf_employees values('${emp}','${user}','active','مرئي',false),('${peer}','${other}','active','خاص',false);
 insert into wf_boards values('${board}','لوحة العمل',null);insert into wf_task_columns values('${col}','in_progress');
 insert into wf_tasks(id,board_id,column_id,title,labels,assignee_id,due_at,updated_at,priority,blocked_reason,requires_approval) values('${uid(30)}','${board}','${col}','مراجعة الفواتير','{}','${emp}','2026-11-20','2026-11-22','high','نحتاج تحققًا',true),('${uid(31)}','${board}','${col}','SECRET PRIVATE TASK','{}','${peer}','2026-11-21','2026-11-22','high','',true);
 insert into service_invoices select gen_random_uuid(),'INV-'||i,'issued',10,'SAR','2026-11-10','2026-11-10','2026-11-10','{"bank":"SECRET BANK"}'::jsonb from generate_series(1,35)i;
 insert into service_invoices values('${uid(50)}','USD-1','issued',7,'USD','2026-11-12',null,'2026-11-12','{}'),('${uid(51)}','OLD','issued',999,'SAR','2026-10-12',null,'2026-10-12','{}');
 insert into payment_refunds values('completed',5,'2026-11-12','2026-11-11'),('pending',30,null,'2026-11-15');
 insert into wf_monthly_payroll values('${emp}','2026-11-01','approved',900,100,'2026-11-12');
 insert into wf_sales_months values('2026-11-01','published',5),('2026-10-01','draft',3);
 insert into wf_sales_plans values('${emp}','2026-11-01','[{"title":"مرئي","target":3}]'),('${peer}','2026-11-01','[{"title":"SECRET GOAL","target":99}]');
 insert into wf_crm_accounts values('${uid(60)}','حساب مرئي','${emp}','SECRET EMAIL'),('${uid(61)}','SECRET ACCOUNT','${peer}','SECRET EMAIL');
 insert into wf_crm_opportunities values('${uid(70)}','${uid(60)}','فرصة مرئية','خدمة','won',100,'${emp}','متابعة','2026-11-24','2026-11-15'),('${uid(71)}','${uid(61)}','SECRET OPPORTUNITY','خدمة','proposal',999,'${peer}','SECRET NEXT','2026-11-25','2026-11-15');
 insert into wf_sales_activities values('${emp}','${uid(70)}','2026-11-01','collection','approved',30,'2026-11-15'),('${peer}','${uid(71)}','2026-11-01','collection','pending',90,'2026-11-16'),('${emp}','${uid(70)}','2026-10-01','collection','approved',999,'2026-10-15');
 insert into social_schedule values('${uid(80)}','حملة فعلية','أخبار','scheduled','2026-11-23','2026-11-22',null);
 insert into postpulse_posts values('${uid(81)}','scheduled','2026-11-23','2026-11-22','2026-11-22','مسودة','{"token":"SECRET TOKEN"}');
 insert into editorial_items values('2026-11-23','approved','none','2026-11-22');
 insert into x_post_metric_snapshots values(1,'post','2026-11-10','{"impression_count":50,"like_count":1}','{"secret":"SECRET METRIC"}'),(2,'post','2026-11-20','{"impression_count":100,"like_count":5}','{}'),(3,'missing','2026-11-21','{}','{}');
 insert into brand_settings values('https://example.com/logo.png','2026-11-01');`);
    const base = await readFile(
      root("supabase/migrations/20260916202246_workforce_task_commands.sql"),
      "utf8",
    );
    const start = base.indexOf(
        "create function workforce_private.assert_task_actor",
      ),
      end = base.indexOf("end $$;", start);
    await db.exec(base.slice(start, end + 7));
    const prior = await readFile(
      root(
        "supabase/migrations/20261122201850_virtual_office_coordination.sql",
      ),
      "utf8",
    );
    const hs = prior.indexOf(
        "create function workforce_private.vo_task_visible",
      ),
      he = prior.indexOf("create function public.vo_coordination_feed");
    await db.exec(prior.slice(hs, he));
    await db.exec(
      await readFile(
        root(
          "supabase/migrations/20261122210021_office_department_data_context.sql",
        ),
        "utf8",
      ),
    );
    await db.exec(
      "grant usage on schema public,workforce_private,auth to service_role;grant all on all tables in schema public,auth to service_role;set role service_role",
    );
    const read = async (department, agent = "editor", actor = admin) =>
      (
        await db.query(
          "select vo_host_department_context($1,$2,$3,$4,$5,$6) data",
          [actor, "nukhba", department, agent, "2026-11-01", "2026-12-01"],
        )
      ).rows[0].data;
    const find = (v, table) => v.sections.find((s) => s.table === table);
    const f = await read("finance");
    assert.equal(f.readOnly, true);
    assert.equal(find(f, "service_invoices").recordCount, 36);
    assert.equal(find(f, "service_invoices").records.length, 30);
    assert.equal(
      find(f, "service_invoices").totals.find((t) => t.currency === "SAR")
        .document_amount,
      "350",
    );
    assert.equal(
      find(f, "service_invoices").totals.find((t) => t.currency === "USD")
        .document_amount,
      "7",
    );
    assert(!JSON.stringify(f).includes("SECRET"));
    assert(find(f, "wf_monthly_payroll"));
    assert(!find(await read("finance", "writer"), "wf_monthly_payroll"));
    assert.equal(
      find(await read("finance", "editor", user), "service_invoices"),
      undefined,
    );
    assert.equal(
      (await read("finance", "editor", user)).sections[0].status,
      "forbidden",
    );
    const sales = await read("sales", "editor", user);
    assert.equal(find(sales, "wf_crm_opportunities").recordCount, 1);
    assert(!JSON.stringify(sales).includes("SECRET"));
    assert.equal(
      find(sales, "wf_sales_activities").totals[0].recorded_amount_sar,
      "30",
    );
    await db.exec(`insert into wf_sales_settings values('${emp}')`);
    assert.equal(
      find(await read("sales", "editor", user), "wf_crm_opportunities")
        .recordCount,
      2,
    );
    const marketing = await read("marketing", "reviewer");
    const metrics = find(marketing, "x_post_metric_snapshots");
    assert.equal(metrics.recordCount, 2);
    assert.equal(metrics.totals.impressions, "100");
    assert.equal(metrics.totals.likes, "5");
    assert.equal(
      metrics.records.find((r) => r.x_post_id === "missing").impressions,
      null,
    );
    assert(!JSON.stringify(marketing).includes("SECRET"));
    assert(!find(marketing, "service_invoices"));
    assert(!find(await read("marketing", "writer"), "x_post_metric_snapshots"));
    assert(find(await read("marketing", "art"), "brand_settings"));
    assert(
      !find(
        await read("marketing", "reviewer", user),
        "x_post_metric_snapshots",
      ),
    );
    assert(!find(await read("people", "researcher"), "wf_monthly_payroll"));
    assert(find(await read("people", "publisher"), "wf_monthly_payroll"));
    assert.equal(
      find(await read("leadership"), "service_invoices").records.length,
      0,
    );
    assert.equal(
      find(await read("operations", "editor", user), "wf_tasks").recordCount,
      1,
    );
    assert.equal(find(f, "wf_tasks").recordCount, 1);
    await db.exec(`update wf_tasks set deleted_at=now() where id='${uid(30)}'`);
    assert.equal(
      find(await read("operations", "editor", user), "wf_tasks").recordCount,
      0,
    );
    await assert.rejects(() => read("finance", "editor", client));
    await assert.rejects(() => read("invalid"));
    await assert.rejects(() => read("finance", "invalid"));
    await db.exec(
      `update auth.users set banned_until=now()+interval '1 day' where id='${admin}'`,
    );
    await assert.rejects(() => read("finance"));
    await db.exec(
      `update auth.users set banned_until=null where id='${admin}'`,
    );
    const s = uid(90),
      lease = uid(91);
    await db.exec(
      `insert into vo_sessions values('${s}','${lease}','running')`,
    );
    assert.equal(
      (
        await db.query("select vo_record_host_context($1,$2,$3,$4) ok", [
          s,
          lease,
          "editor",
          "مصادر".repeat(400),
        ])
      ).rows[0].ok,
      true,
    );
    await db.exec(`update vo_sessions set status='cancelled'`);
    assert.equal(
      (
        await db.query("select vo_record_host_context($1,$2,$3,$4) ok", [
          s,
          lease,
          "editor",
          "late",
        ])
      ).rows[0].ok,
      false,
    );
    await db.exec("reset role;set role authenticated");
    await assert.rejects(() => read("finance"));
    await db.exec("reset role;set role anon");
    await assert.rejects(() => read("finance"));
  } finally {
    await db.close();
  }
});
