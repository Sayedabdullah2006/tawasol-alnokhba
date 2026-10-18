import Link from "next/link";
import {
  createServiceRoleClient,
  type WorkforceActor,
} from "@/lib/workforce/server";
import { TASK_STATES, workDate } from "@/lib/workforce/task-types";

export default async function WorkDashboard({
  actor,
}: {
  actor: WorkforceActor;
}) {
  const employee = actor.employee!;
  const query = () =>
    actor.db
      .from("wf_tasks")
      .select(
        "id,title,client_name,assignee_id,due_at,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)",
      )
      .is("archived_at", null)
      .is("board.archived_at", null)
      .neq("column.kind", "done")
      .order("due_at", { nullsFirst: false })
      .order("id")
      .limit(5);
  const [mine, team] = await Promise.all([
    query().eq("assignee_id", employee.id),
    query().neq("assignee_id", employee.id),
  ]);
  const ids = [
    ...new Set((team.data ?? []).map((row) => row.assignee_id).filter(Boolean)),
  ];
  const service = await createServiceRoleClient();
  const names = ids.length
    ? await service.from("wf_employees").select("id,full_name").in("id", ids)
    : { data: [], error: null };
  const nameMap = new Map(
    (names.data ?? []).map((row) => [row.id, row.full_name]),
  );
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      {[
        {
          title: "مهامي — أقرب التسليمات",
          result: mine,
          href: "/employee/work/tasks?scope=assigned&open=true&sort=due",
          own: true,
        },
        {
          title: "مهام الفريق — للمتابعة فقط",
          result: team,
          href: "/employee/work/tasks?open=true&sort=due",
          own: false,
        },
      ].map((section) => (
        <section
          key={section.title}
          className="rounded-2xl border border-border bg-white p-5"
        >
          <h2 className="text-lg font-black">{section.title}</h2>
          {section.result.error || names.error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              تعذر تحميل المهام. افتحي مساحة المهام لإعادة المحاولة.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {!section.result.data?.length && (
                <p className="text-sm text-muted">
                  لا توجد مهام مفتوحة حاليًا.
                </p>
              )}
              {section.result.data?.map((task) => {
                const column = Array.isArray(task.column)
                  ? task.column[0]
                  : task.column;
                const late =
                  task.due_at && new Date(task.due_at).getTime() < Date.now();
                return (
                  <Link
                    key={task.id}
                    href={`/employee/work/tasks/${task.id}`}
                    className="block space-y-2 rounded-xl border border-border p-4 hover:bg-slate-50"
                  >
                    <p className="text-xs text-muted">
                      {task.client_name || "غير مصنفة"} ·{" "}
                      {TASK_STATES[column?.kind as keyof typeof TASK_STATES]}
                    </p>
                    <p className="break-words font-bold">{task.title}</p>
                    {!section.own && (
                      <p className="text-xs">
                        المسؤولة: {nameMap.get(task.assignee_id) ?? "غير محددة"}{" "}
                        · للقراءة فقط
                      </p>
                    )}
                    <p
                      className={`text-xs ${late ? "text-red-700" : "text-muted"}`}
                    >
                      {late ? "متأخرة · " : ""}التسليم: {workDate(task.due_at)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
          <Link
            href={section.href}
            className="mt-4 inline-block text-sm font-bold text-green"
          >
            عرض كل المهام ←
          </Link>
        </section>
      ))}
    </div>
  );
}
