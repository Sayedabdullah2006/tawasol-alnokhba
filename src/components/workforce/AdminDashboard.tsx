"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import {
  type AdminWorkDashboard,
  type WorkMetrics,
} from "@/lib/workforce/dashboard-types";
import { STATUS_LABELS } from "@/lib/workforce/types";
import { workDate } from "@/lib/workforce/task-types";
import { api, Notice, Panel } from "./shared";
import TaskWorkspace from "./TaskWorkspace";
import TaskDetail from "./TaskDetail";
import MonthlyPayroll from "./MonthlyPayroll";

const numbers = new Intl.NumberFormat("ar-SA");
const count = (value: number) => numbers.format(value);
const percent = (part: number, total: number) =>
  total ? `${count(Math.round((part * 100) / total))}٪` : "—";
const metricColumns: { key: keyof WorkMetrics; label: string }[] = [
  { key: "assigned", label: "المسندة" },
  { key: "completed", label: "المنجزة" },
  { key: "open", label: "المفتوحة" },
  { key: "overdue", label: "المتأخرة" },
  { key: "pending", label: "بانتظار الاعتماد" },
];

export default function AdminDashboard({ userId }: { userId: string }) {
  const params = useSearchParams(),
    pathname = usePathname(),
    router = useRouter();
  const [data, setData] = useState<AdminWorkDashboard | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<string | null>(null);
  const detailOpen = !!selectedTask || !!selectedPayroll;
  const [loadedKey, setLoadedKey] = useState("");
  const pendingQuery = useRef(params.toString());
  const summaryParams = new URLSearchParams();
  for (const key of ["due_from", "due_to", "assignee_id", "client_name"]) {
    const value = params.get(key);
    if (value) summaryParams.set(key, value);
  }
  const summaryQuery = summaryParams.toString();
  const requestKey = `${summaryQuery}:${revision}`;
  const loading = loadedKey !== requestKey;
  const query = params.toString();
  useEffect(() => {
    pendingQuery.current = query;
  }, [query]);
  useEffect(() => {
    const abort = new AbortController();
    api<AdminWorkDashboard>(`/api/workforce/dashboard?${summaryQuery}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setData(result);
        setError("");
        setLoadedKey(requestKey);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setData(null);
          setError(e.message);
          setLoadedKey(requestKey);
        }
      });
    return () => abort.abort();
  }, [summaryQuery, requestKey]);
  function filter(patch: Record<string, string>) {
    const next = new URLSearchParams(pendingQuery.current);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    next.delete("board_id");
    next.delete("scope");
    next.delete("archived");
    next.delete("column_id");
    next.delete("q");
    pendingQuery.current = next.toString();
    router.replace(`${pathname}?${next}`, { scroll: false });
    document
      .getElementById("admin-work")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function metricFilter(key: keyof WorkMetrics, employee?: string) {
    filter({
      state: key === "completed" ? "done" : key === "pending" ? "review" : "",
      overdue: key === "overdue" ? "true" : "",
      open: key === "open" ? "true" : "",
      blocked: "",
      ...(employee ? { assignee_id: employee } : {}),
    });
  }
  function changed() {
    setRevision((n) => n + 1);
    window.dispatchEvent(new Event("workforce-notifications"));
  }
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-green">إدارة فريق العمل</p>
          <h1 className="mt-2 text-3xl font-black">داشبورد الموظفات والمهام</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            متابعة توزيع العمل والإنجاز والمتأخرات، وإسناد المهام ومراجعة
            التسليمات واعتمادها من مكان واحد.
          </p>
        </div>
        <nav aria-label="إدارة الفريق" className="flex flex-wrap gap-3">
          <Link
            href="/admin/workforce/employees"
            className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-bold"
          >
            إدارة الموظفات وإضافة موظفة
          </Link>
          <Link
            href="/admin/workforce/notifications"
            className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-bold"
          >
            الإشعارات
          </Link>
          <Button variant="outline" onClick={changed}>
            تحديث الداشبورد
          </Button>
        </nav>
      </header>
      <Notice message={error} error />
      <section
        aria-label="ملخص أداء الفريق"
        aria-busy={loading}
        className="grid grid-cols-2 gap-3 xl:grid-cols-5"
      >
        {metricColumns.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={loading || !data || detailOpen}
            onClick={() => metricFilter(item.key)}
            className="rounded-2xl border border-border bg-white p-5 text-right hover:border-green disabled:opacity-60"
          >
            <span className="text-sm font-bold">{item.label}</span>
            <strong
              className={`my-3 block text-3xl font-black ${item.key === "overdue" ? "text-red-700" : "text-green"}`}
            >
              {loading ? "…" : data ? count(data.totals[item.key]) : "—"}
            </strong>
            <span className="text-xs text-muted">عرض المهام المطابقة ←</span>
          </button>
        ))}
      </section>
      <Panel
        title="أداء كل موظفة"
        description="المؤشرات تستبعد المهام واللوحات المؤرشفة. الفترة حسب موعد التسليم بتوقيت الرياض؛ عند تحديد فترة تُستبعد المهام بلا موعد. المتأخرة قد تشمل تسليمًا ينتظر اعتماد الإدارة."
      >
        {loading ? (
          <p role="status">جارٍ تحديث مؤشرات الأداء…</p>
        ) : data ? (
          <>
            <p className="mb-4 text-xs leading-6 text-muted">
              آخر تحديث: {workDate(data.generated_at)} · نسبة الإنجاز = المنجزة
              ÷ المسندة. الالتزام بالموعد يُحسب للمهام المنجزة ذات موعد ووقت
              إكمال مسجلين. تصفية حالة قائمة المهام لا تغير مؤشرات الفترة
              والعميل والموظفة.
            </p>
            {data.employees.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-right text-sm">
                  <caption className="sr-only">
                    مؤشرات المهام لكل موظفة في نطاق التصفية
                  </caption>
                  <thead>
                    <tr className="border-b border-border bg-slate-50">
                      <th scope="col" className="p-3">
                        الموظفة
                      </th>
                      {metricColumns.map((c) => (
                        <th key={c.key} scope="col" className="p-3">
                          {c.label}
                        </th>
                      ))}
                      <th scope="col" className="p-3">
                        نسبة الإنجاز
                      </th>
                      <th scope="col" className="p-3">
                        الالتزام بالموعد
                      </th>
                      <th scope="col" className="p-3">
                        المتابعة
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((employee) => (
                      <tr key={employee.id} className="border-b border-border">
                        <th scope="row" className="p-3">
                          <p>{employee.full_name}</p>
                          <p className="mt-1 text-xs font-normal text-muted">
                            {employee.job_title || "دون مسمى"} ·{" "}
                            {STATUS_LABELS[employee.status]}
                          </p>
                        </th>
                        {metricColumns.map((c) => (
                          <td key={c.key} className="p-3">
                            <button
                              type="button"
                              disabled={detailOpen}
                              onClick={() => metricFilter(c.key, employee.id)}
                              aria-label={`${c.label} — ${employee.full_name}: ${count(employee.metrics[c.key])}`}
                              className={`min-h-10 min-w-10 rounded-lg px-2 font-bold hover:bg-slate-100 ${c.key === "overdue" && employee.metrics.overdue ? "text-red-700" : ""}`}
                            >
                              {count(employee.metrics[c.key])}
                            </button>
                          </td>
                        ))}
                        <td className="p-3">
                          <span>
                            {percent(
                              employee.metrics.completed,
                              employee.metrics.assigned,
                            )}
                          </span>
                          <progress
                            aria-label={`نسبة إنجاز ${employee.full_name}`}
                            className="mt-2 block h-2 w-20 accent-green"
                            max={Math.max(1, employee.metrics.assigned)}
                            value={employee.metrics.completed}
                          />
                        </td>
                        <td className="p-3">
                          {percent(
                            employee.metrics.on_time,
                            employee.metrics.dated_completed,
                          )}
                          <p className="mt-1 text-xs text-muted">
                            {count(employee.metrics.on_time)} من{" "}
                            {count(employee.metrics.dated_completed)}
                          </p>
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={detailOpen}
                            onClick={() =>
                              metricFilter("assigned", employee.id)
                            }
                          >
                            مهامها وإسناد مهمة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={detailOpen}
                            onClick={() => {
                              setSelectedPayroll(employee.id);
                              document
                                .getElementById("admin-work")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }}
                          >
                            الراتب والحوافز — {employee.full_name}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                لا توجد موظفات ضمن نطاق العرض. أضيفي موظفة من إدارة الموظفات أو
                غيّري التصفية.
              </p>
            )}
            {!!data.unassigned?.assigned && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                توجد {count(data.unassigned.assigned)} مهام غير مسندة، وهي
                محسوبة في إجمالي الفريق. افتحي المهمة لتحديد الموظفة المسؤولة.
              </p>
            )}
            <p className="mt-4 text-xs text-muted">
              هذه مؤشرات تشغيلية؛ جودة العمل وصعوبة المهام وتوزيع الأعباء تحتاج
              مراجعة الإدارة.
            </p>
          </>
        ) : (
          !error && <p>لا توجد بيانات للعرض.</p>
        )}
      </Panel>
      <section
        id="admin-work"
        className="scroll-mt-32"
        aria-label="إسناد المهام ومراجعة التسليمات"
      >
        {selectedPayroll ? (
          <MonthlyPayroll
            key={selectedPayroll}
            employeeId={selectedPayroll}
            admin
            onClose={() => setSelectedPayroll(null)}
          />
        ) : selectedTask ? (
          <TaskDetail
            key={selectedTask}
            id={selectedTask}
            admin
            onChanged={changed}
            onClose={() => setSelectedTask(null)}
          />
        ) : (
          <TaskWorkspace
            admin
            userId={userId}
            embedded
            refreshKey={revision}
            clients={data?.clients}
            onOpenTask={(id) => {
              setSelectedTask(id);
              document
                .getElementById("admin-work")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            onChanged={changed}
          />
        )}
      </section>
    </div>
  );
}
