import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { randomUUID } from "node:crypto";
const file = (name) => new URL("../" + name, import.meta.url);
const moduleUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const deptUrl = moduleUrl(
  compile(
    await readFile(file("src/lib/virtual-office/departments.ts"), "utf8"),
  ).replace(
    'from "./domain"',
    `from "${file("src/lib/virtual-office/domain.ts").href}"`,
  ),
);
const layoutUrl = moduleUrl(
  compile(
    await readFile(file("src/lib/virtual-office/scene-layout.ts"), "utf8"),
  )
    .replace(
      'from "./domain"',
      `from "${file("src/lib/virtual-office/domain.ts").href}"`,
    )
    .replace('from "./departments"', `from "${deptUrl}"`),
);
const coord = await import(
  moduleUrl(
    compile(
      await readFile(file("src/lib/virtual-office/coordination.ts"), "utf8"),
    )
      .replace(
        'from "./domain"',
        `from "${file("src/lib/virtual-office/domain.ts").href}"`,
      )
      .replace('from "./departments"', `from "${deptUrl}"`),
  )
);
const motion = await import(
  moduleUrl(
    compile(
      await readFile(
        file("src/components/virtual-office/coordination-motion.ts"),
        "utf8",
      ),
    ).replace(
      'from "./office-navigation"',
      `from "${file("src/components/virtual-office/office-navigation.ts").href}"`,
    ),
  )
);
const { officeFloor } = await import(
    file("src/components/virtual-office/office-navigation.ts").href
  ),
  { companyRooms } = await import(layoutUrl);
const now = "2026-11-22T20:00:00.000Z";
test("morning brief uses Riyadh work dates, approved records and only the supplied visibility scope", () => {
  assert.equal(coord.officeDay("2026-11-21T21:30:00Z").day, "2026-11-22");
  assert.equal(
    coord.officeDay("2026-11-21T06:00:00Z").previousDay,
    "2026-11-19",
  );
  const base = {
    id: "a",
    title: "مهمة مرئية",
    version: 1,
    state: "in_progress",
    assigneeId: "a",
    coAssigneeIds: [],
    dueAt: "2026-11-22T15:00Z",
    completedAt: null,
    updatedAt: now,
    blockedReason: "نحتاج المصادر",
    priority: "high",
    requiresApproval: true,
  };
  const brief = coord.buildMorningBriefing(
    [
      base,
      { ...base, id: "done", state: "done", completedAt: "2026-11-21T12:00Z" },
    ],
    [],
    now,
    false,
  );
  assert.equal(brief.completed, 1);
  assert.equal(brief.dueToday, 1);
  assert.equal(brief.blocked, 1);
  assert(
    brief.sections
      .flatMap((s) => s.items)
      .every((i) => i.href.startsWith("/employee/work/tasks/")),
  );
  assert(!JSON.stringify(brief).includes("مهمة سرية غير متاحة"));
});
test("help ranking combines specialty and actual availability, and excludes unauthorized people", () => {
  const task = {
    id: "a",
    title: "إصلاح خطأ تقني في الواجهة",
    blockedReason: "تعطل الربط",
  };
  const people = [
    ["a", "finance", "available"],
    ["b", "technology", "available"],
    ["c", "technology", "busy"],
    ["secret", "technology", "available"],
  ].map(([id, officeDepartment, state]) => ({
    id,
    name: id,
    jobTitle: "عضو فريق",
    officeDepartment,
    presence: { online: true, state, observedAt: now },
  }));
  const result = coord.rankHelpCandidates(people, ["a", "b", "c"], task, now);
  assert.deepEqual(
    result.map((p) => p.employeeId),
    ["b", "c", "a"],
  );
  assert(!result.some((p) => p.employeeId === "secret"));
});
test("virtual handoff motion distinguishes pending approval from an actually approved assignment", () => {
  const base = {
    id: "x",
    kind: "team",
    agent_id: "editor",
    title: "خطة فعلية",
    workflow: "adaptive",
    plan: {
      summary: "بحث ثم كتابة",
      steps: [{ agentId: "researcher" }, { agentId: "writer" }],
    },
    plan_version: 1,
    approved_plan_version: 1,
    approved_step: 1,
    step: 2,
    status: "handoff",
    updated_at: now,
    context: { department: "content" },
  };
  const waiting = coord.virtualInteractions([base])[0];
  assert.equal(waiting.from.id, "researcher");
  assert.equal(waiting.to.id, "editor");
  assert.match(waiting.text, /ينتظر موافقة/);
  const approved = coord.virtualInteractions([
    { ...base, status: "queued", approved_step: 2 },
  ])[0];
  assert.equal(approved.from.id, "editor");
  assert.equal(approved.to.id, "writer");
  assert.equal(
    coord.virtualInteractions([{ ...base, status: "queued", approved_step: 1 }])
      .length,
    0,
    "a display animation cannot invent an approved assignment",
  );
});
test("interaction walks take real collision-safe steps, pause at the colleague and return home", () => {
  const floor = officeFloor([], 7, 10),
    start = { x: 5, z: 5 },
    destination = { x: -6, z: 2 };
  const walker = motion.createInteractionWalk(floor, start, destination, start);
  let position = start,
    done = false,
    moved = false,
    paused = false;
  for (let i = 0; i < 5000 && !done; i++) {
    const step = walker.tick(i * 50, 0.05, position);
    if (step.walking) {
      moved = true;
      assert(floor.canStand(step.position));
    }
    paused ||= step.phase === "pause";
    position = step.position;
    done = step.done;
  }
  assert(moved && paused && done);
  assert(Math.hypot(position.x - start.x, position.z - start.z) < 0.7);
  for (const cols of [2, 4]) {
    const rooms = companyRooms([], cols),
      world = motion.companyWalkFloor(rooms),
      first = rooms[0],
      last = rooms[7];
    const from = { x: first.x - 5, z: first.z - first.depth / 2 + 4.55 },
      to = { x: last.x + 5, z: last.z + last.depth / 2 - 4.55 };
    const route = motion.createInteractionWalk(world, from, to, from);
    let p = from,
      complete = false;
    for (let i = 0; i < 15000 && !complete; i++) {
      const step = route.tick(i * 50, 0.05, p);
      if (step.walking) assert(world.canStand(step.position));
      p = step.position;
      complete = step.done;
    }
    assert(
      complete,
      "cross-department walk completes for " + cols + " columns",
    );
  }
});

test("SQL gates new stages on manager approval, scopes help, fences stale writes and provides live HR facts", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    admin = uid(1),
    a = uid(2),
    b = uid(3),
    c = uid(4),
    m = uid(5),
    client = uid(6),
    ea = uid(12),
    eb = uid(13),
    ec = uid(14),
    em = uid(15),
    board = uid(20),
    active = uid(21),
    done = uid(22),
    task = uid(30);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema workforce_private;create schema auth;
   create table auth.users(id uuid primary key,banned_until timestamptz);create table profiles(id uuid primary key,role text);
   create table wf_departments(id uuid primary key,name text);create table wf_employees(id uuid primary key,user_id uuid unique,full_name text,job_title text,department_id uuid,status text,can_manage_tasks boolean default false);
   create table wf_boards(id uuid primary key,archived_at timestamptz);create table wf_task_columns(id uuid primary key,kind text);
   create table wf_tasks(id uuid primary key,board_id uuid,column_id uuid,title text,description text default '',assignee_id uuid,co_assignee_ids uuid[] not null default '{}',version int not null default 1,deleted_at timestamptz,archived_at timestamptz,test_run_id uuid,requires_approval boolean default true);
   create table wf_employee_requests(id uuid,employee_id uuid,status text,test_run_id uuid,kind text,starts_at timestamptz,ends_at timestamptz);
   create table vo_sessions(id uuid primary key,lease_token uuid,status text);create table vo_messages(session_id uuid,message_key text,agent_id text,kind text,content text,citations jsonb,unique(session_id,message_key));
   create table created_task_payloads(id uuid,payload jsonb);
   create function workforce_private.work_now() returns timestamptz language sql as $$select '${now}'::timestamptz$$;
   create function workforce_private.task_actor_unbanned(p_actor uuid) returns boolean language sql as $$select current_setting('role',true)='service_role' and exists(select 1 from auth.users where id=p_actor and (banned_until is null or banned_until<now()))$$;
   create function workforce_private.can_manage_tasks(p_actor uuid) returns boolean language sql as $$select exists(select 1 from public.profiles p left join public.wf_employees e on e.user_id=p.id and e.status='active' where p.id=p_actor and (p.role='admin' or p.role='employee' and e.can_manage_tasks))$$;
   create function workforce_private.assert_task_management_action(p_actor uuid) returns void language plpgsql as $$begin if not workforce_private.can_manage_tasks(p_actor) and current_setting('vo.test_working',true)='false' then raise insufficient_privilege;end if;end$$;
   create function public.vo_staff_directory(p_actor uuid,p_workspace text) returns jsonb language sql as $$select jsonb_build_object('staff',coalesce(jsonb_agg(jsonb_build_object('id',id,'presence',jsonb_build_object('online',false,'state','offline','observedAt','${now}'))),'[]'::jsonb)) from public.wf_employees where status='active'$$;
   create function public.wf_task_command(p_actor uuid,p_id uuid,p_version int,p_command text,p_payload jsonb,p_key uuid) returns jsonb language plpgsql as $$begin if not workforce_private.can_manage_tasks(p_actor) then raise insufficient_privilege;end if;insert into public.wf_tasks(id,board_id,column_id,title,description,assignee_id,requires_approval) values(p_id,'${board}','${active}',p_payload->>'title',p_payload->>'description',(p_payload->>'assignee_id')::uuid,(p_payload->>'requires_approval')::boolean);insert into public.created_task_payloads values(p_id,p_payload);return jsonb_build_object('id',p_id);end$$;
   insert into profiles values('${admin}','admin'),('${a}','employee'),('${b}','employee'),('${c}','employee'),('${m}','employee'),('${client}','client');insert into auth.users select id,null from profiles;
   insert into wf_employees(id,user_id,full_name,job_title,status,can_manage_tasks) values('${ea}','${a}','كاتب الاختبار','كاتب','active',false),('${eb}','${b}','مساند الاختبار','باحث','active',false),('${ec}','${c}','مستلم الاختبار','مصمم','active',false),('${em}','${m}','مدير الاختبار','مدير','active',true);
   insert into wf_boards values('${board}',null);insert into wf_task_columns values('${active}','in_progress'),('${done}','done');
   insert into wf_tasks(id,board_id,column_id,title,description,assignee_id,co_assignee_ids) values('${task}','${board}','${active}','المهمة الأصلية','SECRET SOURCE FILES','${ea}',array['${eb}'::uuid]);`);
    const foundation = await readFile(
        file("supabase/migrations/20260916202246_workforce_task_commands.sql"),
        "utf8",
      ),
      begin = foundation.indexOf(
        "create function workforce_private.assert_task_actor",
      ),
      end = foundation.indexOf("end $$;", begin);
    await db.exec(foundation.slice(begin, end + 7));
    await db.exec(
      await readFile(
        file(
          "supabase/migrations/20261122203410_virtual_office_coordination.sql",
        ),
        "utf8",
      ),
    );
    await db.exec(
      "grant usage on schema public,workforce_private,auth to service_role;grant all on all tables in schema public,auth to service_role;grant execute on all functions in schema workforce_private to service_role;set role service_role;",
    );
    const command = async (
      actor,
      cmd,
      payload = {},
      id = null,
      version = null,
      key = randomUUID(),
    ) =>
      (
        await db.query(
          "select vo_coordination_command($1,$2,$3,$4,$5,$6::jsonb,$7) result",
          [actor, "qa", cmd, id, version, JSON.stringify(payload), key],
        )
      ).rows[0].result;
    const feed = async (actor) =>
      (
        await db.query("select vo_coordination_feed($1,$2) result", [
          actor,
          "qa",
        ])
      ).rows[0].result;
    const key = randomUUID(),
      helpPayload = {
        kind: "help",
        taskId: task,
        taskVersion: 1,
        targetId: eb,
        summary: "نحتاج مساعدة للتحقق من المصادر",
        nextTitle: "",
      };
    const helpers = (
      await db.query("select vo_help_candidates($1,$2) ids", [a, task])
    ).rows[0].ids;
    assert(
      helpers.includes(eb) &&
        helpers.includes(em) &&
        !helpers.includes(ec) &&
        !helpers.includes(ea),
    );
    await assert.rejects(command(client, "create", helpPayload), {
      code: "42501",
    });
    await assert.rejects(command(c, "create", helpPayload), { code: "42501" });
    await assert.rejects(
      command(a, "create", { ...helpPayload, targetId: ec }),
      { code: "42501" },
    );
    const help = await command(a, "create", helpPayload, null, null, key);
    assert.equal(
      (await command(a, "create", helpPayload, null, null, key)).id,
      help.id,
    );
    await assert.rejects(
      command(
        a,
        "create",
        { ...helpPayload, summary: "طلب مختلف" },
        null,
        null,
        key,
      ),
      { code: "PT409" },
    );
    assert.equal((await feed(c)).length, 0);
    assert.equal((await feed(b))[0].id, help.id);
    await assert.rejects(command(a, "accept", {}, help.id, 1), {
      code: "42501",
    });
    const accepted = await command(b, "accept", {}, help.id, 1);
    assert.equal(accepted.version, 2);
    await assert.rejects(
      command(b, "resolve", { resolution: "راجعنا المصادر" }, help.id, 1),
      { code: "PT409" },
    );
    await command(
      b,
      "resolve",
      { resolution: "راجعنا المصادر وثبتنا التاريخ" },
      help.id,
      2,
    );
    assert.equal((await feed(a))[0].state, "resolved");
    const handoff = await command(a, "create", {
      kind: "handoff",
      taskId: task,
      taskVersion: 1,
      targetId: ec,
      summary: "هذا النص المعتمد للتصميم فقط",
      nextTitle: "تصميم القصة",
    });
    assert.equal(
      (await db.query("select count(*) n from created_task_payloads")).rows[0]
        .n,
      0,
      "no next task before approval",
    );
    assert(
      !(await feed(c)).some((r) => r.id === handoff.id),
      "recipient sees no pending private handoff",
    );
    await assert.rejects(
      command(a, "approve", { taskVersion: 1 }, handoff.id, 1),
      { code: "42501" },
    );
    await assert.rejects(
      command(admin, "approve", { taskVersion: 1 }, handoff.id, 1),
      { code: "PT409" },
    );
    await db.query(
      "update wf_tasks set column_id=$1,version=version+1 where id=$2",
      [done, task],
    );
    await assert.rejects(
      command(admin, "approve", { taskVersion: 1 }, handoff.id, 1),
      { code: "PT409" },
    );
    const approved = await command(
      admin,
      "approve",
      { taskVersion: 2 },
      handoff.id,
      1,
    );
    assert(approved.nextTaskId);
    assert.equal(
      (await command(admin, "approve", { taskVersion: 2 }, handoff.id, 1))
        .nextTaskId,
      approved.nextTaskId,
    );
    assert.equal(
      (await db.query("select count(*) n from created_task_payloads")).rows[0]
        .n,
      1,
      "repeated approval creates one next task",
    );
    const payload = (
      await db.query("select payload from created_task_payloads")
    ).rows[0].payload;
    assert.equal(payload.requires_approval, true);
    assert.equal(payload.description, "هذا النص المعتمد للتصميم فقط");
    assert(!JSON.stringify(payload).includes("SECRET"));
    const received = (await feed(c)).find((r) => r.id === handoff.id);
    assert.equal(received.taskId, null);
    assert.equal(received.taskTitle, "تسليم معتمد");
    assert.equal(received.nextTaskId, approved.nextTaskId);
    await db.query("update wf_tasks set co_assignee_ids='{}' where id=$1", [
      task,
    ]);
    assert(
      !(await feed(b)).some((r) => r.id === help.id),
      "revoked task access revokes help history",
    );
    await db.exec("set vo.test_working='false'");
    await assert.rejects(
      command(a, "create", { ...helpPayload, taskVersion: 2 }),
      { code: "42501" },
    );
    await db.exec("set vo.test_working='true'");
    const hr = (
      await db.query("select vo_host_staff_context($1,$2) result", [
        admin,
        "qa",
      ])
    ).rows[0].result;
    assert.equal(hr.counts.active, 4);
    assert(hr.employees.every((p) => p.attendance.online === false));
    assert(hr.employees.every((p) => p.employmentStatus === "active"));
    assert(!JSON.stringify(hr).includes("SECRET"));
    await assert.rejects(
      db.query("select vo_host_staff_context($1,$2)", [a, "qa"]),
      { code: "42501" },
    );
    const sid = randomUUID(),
      lease = randomUUID();
    await db.query("insert into vo_sessions values($1,$2,'running')", [
      sid,
      lease,
    ]);
    assert.equal(
      (
        await db.query("select vo_record_host_context($1,$2,$3,$4) saved", [
          sid,
          lease,
          "researcher",
          "قراءة حية موثقة",
        ])
      ).rows[0].saved,
      true,
    );
    await db.query("update vo_sessions set status='cancelled' where id=$1", [
      sid,
    ]);
    assert.equal(
      (
        await db.query("select vo_record_host_context($1,$2,$3,$4) saved", [
          sid,
          lease,
          "researcher",
          "رسالة متأخرة",
        ])
      ).rows[0].saved,
      false,
    );
    assert.equal(
      (await db.query("select count(*) n from vo_messages")).rows[0].n,
      1,
    );
    await db.query(
      "update auth.users set banned_until=now()+interval '1 day' where id=$1",
      [a],
    );
    await assert.rejects(feed(a), { code: "42501" });
    for (const role of ["anon", "authenticated"]) {
      await db.exec("reset role;set role " + role);
      await assert.rejects(feed(admin), { code: "42501" });
      await assert.rejects(db.query("select * from vo_coordination"), {
        code: "42501",
      });
      await assert.rejects(
        command(admin, "approve", { taskVersion: 2 }, handoff.id, 1),
        { code: "42501" },
      );
    }
  } finally {
    await db.close();
  }
});
