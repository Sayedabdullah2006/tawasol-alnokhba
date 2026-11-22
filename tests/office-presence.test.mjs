import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { presenceView } from "../src/lib/virtual-office/presence.ts";
const migration = new URL(
  "../supabase/migrations/20261122192811_virtual_office_employee_access.sql",
  import.meta.url,
);
const now = "2026-11-22T10:00:00.000Z";
test("presence uses text as well as colors and stops claiming online after a failed refresh", () => {
  const base = {
    online: true,
    state: "busy",
    detail: "meeting",
    observedAt: now,
  };
  assert.match(
    presenceView(base, Date.parse(now)).label,
    /أونلاين.*مشغول.*اجتماع/,
  );
  assert.equal(
    presenceView({ ...base, state: "break", detail: "break" }, Date.parse(now))
      .state,
    "break",
  );
  assert.equal(
    presenceView({ ...base, state: "offline", online: false }, Date.parse(now))
      .state,
    "offline",
  );
  assert.equal(presenceView(base, Date.parse(now) + 45001).state, "unknown");
  assert.equal(presenceView(undefined, Date.parse(now)).state, "unknown");
  assert.equal(
    presenceView({ ...base, observedAt: "invalid" }, Date.parse(now)).state,
    "unknown",
  );
});

test("real SQL: attendance, meeting, break, active task, expiry, session-bound preference and least-privilege directory", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001",
    user = "00000000-0000-4000-8000-000000000002",
    peer = "00000000-0000-4000-8000-000000000003",
    client = "00000000-0000-4000-8000-000000000004";
  const employee = "00000000-0000-4000-8000-000000000012",
    other = "00000000-0000-4000-8000-000000000013",
    session = "00000000-0000-4000-8000-000000000022";
  const source = async (name) =>
    readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    );
  const extract = (sql, start) => {
    const begin = sql.indexOf(start);
    assert(begin >= 0, start);
    const end = sql.indexOf("end $$;", begin);
    assert(end > begin);
    return sql.slice(begin, end + 7);
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema workforce_private;create table profiles(id uuid primary key,role text);
   create table wf_departments(id uuid primary key,name text);create table wf_employees(id uuid primary key,user_id uuid,full_name text,job_title text,department_id uuid,status text);
   create table wf_attendance_sessions(id uuid primary key,employee_id uuid,business_date date,checked_in timestamptz,checked_out timestamptz,policy_version int,cutoff_at timestamptz,last_seen_at timestamptz,next_confirmation_at timestamptz,break_started_at timestamptz,break_paid_until timestamptz,meeting_id uuid,meeting_until timestamptz,overtime_request_id uuid,device_hash text,close_reason text);
   create table wf_employee_requests(id uuid primary key,employee_id uuid,kind text,status text,test_run_id uuid,starts_at timestamptz,ends_at timestamptz);
   create table wf_work_segments(id uuid primary key,session_id uuid,employee_id uuid,kind text,starts_at timestamptz,ends_at timestamptz);
   create table vo_staff_avatars(employee_id uuid,workspace_id text,preset text,primary key(employee_id,workspace_id));
   create function workforce_private.work_now() returns timestamptz language sql as $$select current_setting('vo.test_now')::timestamptz$$;
   create function workforce_private.task_actor_unbanned(uuid) returns boolean language sql as $$select true$$;
   create function workforce_private.close_work_session(p_id uuid,p_at timestamptz,p_reason text) returns void language sql as $$update wf_attendance_sessions set checked_out=p_at,close_reason=p_reason where id=p_id$$;
   set vo.test_now='${now}';
   insert into profiles values('${admin}','admin'),('${user}','employee'),('${peer}','employee'),('${client}','client');
   insert into wf_employees values('${employee}','${user}','موظف اختبار','كاتب',null,'active'),('${other}','${peer}','زميل اختبار','محاسب',null,'active');`);
    await db.exec(
      extract(
        await source("20260916202246_workforce_task_commands.sql"),
        "create function workforce_private.assert_task_actor",
      ),
    );
    let expiry = extract(
      await source("20261022213937_linked_work_sessions.sql"),
      "create function workforce_private.work_expiry",
    );
    expiry = expiry.replace(
      "if tick>=seen+interval '5 minutes'",
      "if s.meeting_until is not null then seen:=greatest(seen,least(s.meeting_until,s.cutoff_at));end if; if tick>=seen+interval '5 minutes'",
    );
    await db.exec(expiry);
    await db.exec(
      extract(
        await source("20261023205919_attendance_action_gate.sql"),
        "create function public.wf_work_action_access",
      ),
    );
    await db.exec(await readFile(migration, "utf8"));
    await db.exec(
      "grant usage on schema public,workforce_private to service_role;grant all on all tables in schema public to service_role;grant execute on all functions in schema workforce_private to service_role;",
    );
    const directory = async (actor = user) =>
      (
        await db.query("select vo_staff_directory($1,$2) result", [
          actor,
          "nukhba",
        ])
      ).rows[0].result;
    const status = async () =>
      (await directory()).staff.find((p) => p.id === employee).presence;
    assert.equal(
      (await status()).state,
      "offline",
      "opening office cannot fake check-in",
    );
    await assert.rejects(directory(client), /غير مصرح/);
    await db.exec(
      `insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,policy_version,cutoff_at,last_seen_at,next_confirmation_at,device_hash) values('${session}','${employee}','2026-11-22','2026-11-22T09:00Z',1,'2026-11-22T15:00Z','${now}','2026-11-22T12:00Z','SECRET_DEVICE');`,
    );
    assert.equal((await status()).state, "available");
    const original = (
      await db.query(
        "select row_to_json(s) value from wf_attendance_sessions s",
      )
    ).rows[0].value;
    const visible = await directory();
    const mine = visible.staff.find((p) => p.id === employee),
      colleague = visible.staff.find((p) => p.id === other);
    assert.equal(mine.ownSessionId, session);
    assert.equal(colleague.ownSessionId, null);
    assert(!JSON.stringify(visible).includes("SECRET_DEVICE"));
    assert.deepEqual(
      Object.keys(mine).sort(),
      [
        "appearance",
        "id",
        "jobTitle",
        "manualState",
        "name",
        "ownSessionId",
        "presence",
        "registeredDepartment",
      ].sort(),
    );
    assert.deepEqual(
      (
        await db.query(
          "select row_to_json(s) value from wf_attendance_sessions s",
        )
      ).rows[0].value,
      original,
      "GET directory never mutates attendance or heartbeat",
    );
    await db.query("select vo_set_availability($1,$2,$3)", [
      user,
      session,
      "busy",
    ]);
    assert.equal((await status()).detail, "manual");
    await assert.rejects(
      db.query("select vo_set_availability($1,$2,$3)", [
        user,
        "00000000-0000-4000-8000-000000000099",
        "available",
      ]),
      /تغيرت جلسة/,
    );
    await assert.rejects(
      db.query("select vo_set_availability($1,$2,$3)", [
        admin,
        session,
        "busy",
      ]),
      { code: "42501" },
    );
    await assert.rejects(
      db.query("select vo_set_availability($1,$2,$3)", [peer, session, "busy"]),
      /تغيرت جلسة/,
    );
    await assert.rejects(
      db.query("select vo_set_availability($1,$2,$3)", [
        user,
        session,
        "break",
      ]),
      /اختر/,
    );
    await db.query("select vo_set_availability($1,$2,$3)", [
      user,
      session,
      "available",
    ]);
    assert.equal((await status()).state, "available");
    await db.exec(
      `insert into wf_work_segments values(gen_random_uuid(),'${session}','${employee}','task','${now}',null);`,
    );
    assert.equal((await status()).detail, "task");
    await db.exec(
      `update wf_attendance_sessions set meeting_id=gen_random_uuid(),meeting_until='2026-11-22T11:00Z',last_seen_at='2026-11-22T09:40Z';`,
    );
    assert.equal(
      (await status()).detail,
      "meeting",
      "joined meeting protects attendance without office heartbeat",
    );
    await db.exec(
      `update wf_attendance_sessions set break_started_at='${now}',break_paid_until='2026-11-22T10:30Z';`,
    );
    assert.equal(
      (await status()).state,
      "break",
      "official break overrides task, meeting and manual preference",
    );
    await assert.rejects(
      db.query("select vo_set_availability($1,$2,$3)", [
        user,
        session,
        "available",
      ]),
      /تغيرت جلسة/,
    );
    await db.exec(
      `update wf_attendance_sessions set break_started_at=null,break_paid_until=null,meeting_id=null,meeting_until=null,last_seen_at='${now}';update wf_work_segments set ends_at='${now}';`,
    );
    assert.equal((await status()).state, "available");
    await db.exec(
      `update wf_attendance_sessions set next_confirmation_at='2026-11-22T09:59Z';`,
    );
    assert.equal((await status()).detail, "confirmation");
    await db.exec(
      `update wf_attendance_sessions set next_confirmation_at='2026-11-22T09:50Z';`,
    );
    assert.equal((await status()).state, "offline");
    await db.exec(
      `update wf_attendance_sessions set next_confirmation_at='2026-11-22T12:00Z',last_seen_at='2026-11-22T09:54Z';`,
    );
    assert.equal(
      (await status()).state,
      "offline",
      "expires through existing work_expiry",
    );
    await db.exec(
      `update wf_attendance_sessions set last_seen_at='${now}',cutoff_at='2026-11-22T09:59Z';`,
    );
    assert.equal((await status()).state, "offline");
    await db.exec(
      `update wf_attendance_sessions set cutoff_at='2026-11-22T15:00Z',overtime_request_id=gen_random_uuid();`,
    );
    assert.equal(
      (await status()).state,
      "offline",
      "unapproved overtime never looks online",
    );
    await db.exec(
      `update wf_attendance_sessions set overtime_request_id=null;`,
    );
    await db.query("select vo_set_availability($1,$2,$3)", [
      user,
      session,
      "busy",
    ]);
    await db.exec(
      `update wf_attendance_sessions set checked_out='${now}';insert into wf_attendance_sessions select '00000000-0000-4000-8000-000000000023',employee_id,business_date,checked_in,null,policy_version,cutoff_at,last_seen_at,next_confirmation_at,null,null,null,null,null,device_hash,null from wf_attendance_sessions where id='${session}';`,
    );
    assert.equal(
      (await status()).state,
      "available",
      "manual busy must not survive a new attendance session",
    );
    await db.exec(
      `update wf_employees set status='inactive' where id='${employee}';`,
    );
    await assert.rejects(directory(), /غير نشط/);
    assert.equal(
      (await directory(admin)).staff.length,
      1,
      "inactive people excluded",
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(directory(admin), /permission/);
      await assert.rejects(
        db.query("select * from vo_staff_availability"),
        /permission/,
      );
      await assert.rejects(
        db.query("select vo_set_availability($1,$2,$3)", [
          user,
          session,
          "busy",
        ]),
        /permission/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal((await directory(admin)).staff.length, 1);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
