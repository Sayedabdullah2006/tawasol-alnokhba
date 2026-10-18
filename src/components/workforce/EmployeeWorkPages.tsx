"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, controlClass, Notice } from "./shared";
import Button from "@/components/ui/Button";
import { TASK_STATES, type WorkTask } from "@/lib/workforce/task-types";

type Row = {
  id: string;
  task_id: string;
  starts_at?: string;
  ends_at?: string | null;
  note?: string;
  created_at?: string;
  summary?: string;
  status?: string;
  decision_reason?: string;
  task: { id: string; title: string; client_name: string };
};
const titles: Record<string, string> = {
  projects: "المشاريع والعملاء",
  calendar: "تقويم العمل",
  time: "سجل وقت العمل",
  deliveries: "تسليماتي",
  archive: "أرشيف المهام",
};
const today = () =>
  new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })
    .slice(0, 7);
const date = (value: string) =>
  new Date(value).toLocaleString("ar-SA", {
    calendar: "gregory",
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  });
const businessDay = (value: string) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const taskLink = (id: string, panel = "brief") =>
  `/employee/work/tasks/${id}?panel=${panel}`;
export default function EmployeeWorkPages({ section }: { section: string }) {
  const [page, setPage] = useState(1),
    [month, setMonth] = useState(today),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0);
  const [tasks, setTasks] = useState<WorkTask[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [count, setCount] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (["time", "deliveries"].includes(section)) params.set("mode", section);
    else {
      params.set("scope", "assigned");
      params.set("sort", section === "calendar" ? "due" : "updated");
      if (query) params.set("client_name", query);
      if (section === "archive") params.set("archived", "true");
      if (section === "calendar") {
        params.set("due_from", month + "-01");
        params.set(
          "due_to",
          month +
            "-" +
            new Date(
              Number(month.slice(0, 4)),
              Number(month.slice(5)),
              0,
            ).getDate(),
        );
      }
    }
    api<{ tasks?: WorkTask[]; rows?: Row[]; count: number }>(
      `/api/workforce/${["time", "deliveries"].includes(section) ? "my-work" : "tasks"}?${params}`,
      { signal: controller.signal },
    )
      .then((result) => {
        setTasks(result.tasks || []);
        setRows(result.rows || []);
        setCount(result.count);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [section, page, month, query, revision]);
  const changePage = (next: number) => {
    setLoading(true);
    setPage(next);
  };
  const grouped = tasks.reduce<Record<string, WorkTask[]>>((result, task) => {
    const client = task.client_name || "تطوير الشركة";
    (result[client] ??= []).push(task);
    return result;
  }, Object.create(null));
  const days =
    section === "calendar"
      ? new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
      : 0;
  const offset =
    section === "calendar"
      ? new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(5)) - 1,
          1,
        ).getDay()
      : 0;
  const card = (task: WorkTask) => (
    <Link
      key={task.id}
      href={taskLink(task.id)}
      className="block rounded-xl border bg-white p-3 hover:border-green"
    >
      <strong className="block break-words text-sm">{task.title}</strong>
      <span className="mt-2 block text-xs text-muted">
        {task.client_name || "تطوير الشركة"} · {TASK_STATES[task.column.kind]}
        {task.due_at ? ` · ${date(task.due_at)}` : ""}
      </span>
    </Link>
  );
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">{titles[section]}</h1>
        <Link
          href="/employee/work/tasks?scope=assigned"
          className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
        >
          لوحة مهامي
        </Link>
      </header>
      {section === "calendar" && (
        <label className="flex items-center gap-3 text-sm font-bold">
          الشهر
          <input
            type="month"
            aria-label="شهر التقويم"
            className={controlClass + " max-w-56"}
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setLoading(true);
                setMonth(e.target.value);
                setPage(1);
              }
            }}
          />
        </label>
      )}
      {section === "projects" && (
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <input
            aria-label="اسم العميل أو المشروع"
            placeholder="اسم العميل أو المشروع"
            className={controlClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit">بحث</Button>
          {query && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch("");
                setQuery("");
                setPage(1);
                setLoading(true);
              }}
            >
              الكل
            </Button>
          )}
        </form>
      )}
      <Notice message={error} error />
      {loading ? (
        <p role="status">جارٍ التحميل…</p>
      ) : (
        <>
          {section === "calendar" ? (
            <div className="overflow-x-auto rounded-xl border bg-white">
              <div className="grid min-w-[650px] grid-cols-7">
                {[
                  "الأحد",
                  "الاثنين",
                  "الثلاثاء",
                  "الأربعاء",
                  "الخميس",
                  "الجمعة",
                  "السبت",
                ].map((day) => (
                  <div
                    key={day}
                    className="border-b bg-slate-50 p-3 text-center text-sm font-bold"
                  >
                    {day}
                  </div>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <div key={`blank-${i}`} className="border-b" />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const day = month + "-" + String(i + 1).padStart(2, "0");
                  return (
                    <div
                      key={day}
                      className="min-h-28 space-y-2 border-b border-l p-2"
                    >
                      <strong className="text-xs">{i + 1}</strong>
                      {tasks
                        .filter(
                          (task) =>
                            task.due_at && businessDay(task.due_at) === day,
                        )
                        .map((task) => (
                          <Link
                            key={task.id}
                            href={taskLink(task.id)}
                            className="block rounded bg-blue-50 p-2 text-xs text-blue-900"
                          >
                            {task.title}
                          </Link>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : section === "projects" ? (
            <div className="space-y-5">
              {Object.entries(grouped).map(([client, list]) => (
                <section
                  key={client}
                  className="rounded-2xl border bg-slate-50 p-4"
                >
                  <h2 className="mb-3 font-black">{client}</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {list?.map(card)}
                  </div>
                </section>
              ))}
            </div>
          ) : section === "archive" ? (
            <div className="grid gap-3 md:grid-cols-2">{tasks.map(card)}</div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="space-y-2 rounded-xl border bg-white p-4"
                >
                  <Link
                    href={taskLink(
                      row.task_id,
                      section === "time" ? "history" : "submit",
                    )}
                    className="font-bold text-green"
                  >
                    {row.task.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {row.task.client_name || "تطوير الشركة"} ·{" "}
                    {date(row.starts_at || row.created_at!)}
                    {section === "time"
                      ? ` · ${row.ends_at ? Math.max(0, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at!)) / 60000)) + " دقيقة" : "مؤقت جارٍ"}`
                      : ` · ${{ pending: "بانتظار المراجعة", approved: "معتمد", changes: "يحتاج تعديلًا" }[row.status || "pending"]}`}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {row.note || row.summary}
                  </p>
                  {row.decision_reason && (
                    <p className="text-sm font-bold">{row.decision_reason}</p>
                  )}
                </article>
              ))}
            </div>
          )}
          {!count && section !== "calendar" && (
            <p className="rounded-xl border bg-white p-5 text-sm text-muted">
              لا توجد سجلات.
            </p>
          )}
          {count > 0 && (
            <p className="text-xs text-muted">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, count)} من {count}
            </p>
          )}
          {count > 20 && (
            <nav aria-label="صفحات السجل" className="flex gap-3">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
              >
                السابق
              </Button>
              <Button
                variant="outline"
                disabled={page * 20 >= count}
                onClick={() => changePage(page + 1)}
              >
                التالي
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
