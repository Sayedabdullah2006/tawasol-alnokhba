"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import type { Department, Employee } from "@/lib/workforce/types";
import { STATUS_LABELS } from "@/lib/workforce/types";
import EmployeeFields, { emptyEmployeeForm } from "./EmployeeFields";
import {
  api,
  controlClass,
  Dialog,
  Field,
  formatDate,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

type DirectoryData = {
  employees: Employee[];
  departments: Department[];
  count: number;
  page: number;
};
export default function EmployeeDirectory({ userId }: { userId: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<DirectoryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyEmployeeForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentMessage, setDepartmentMessage] = useState("");
  const [departmentBusy, setDepartmentBusy] = useState(false);
  const requestKey = useRef("");
  const restoredFilters = useRef(false);
  const query = params.toString();
  const pendingQuery = useRef(query);
  useEffect(() => {
    pendingQuery.current = query;
  }, [query]);
  useEffect(() => {
    try {
      if (!restoredFilters.current) {
        restoredFilters.current = true;
        const saved = localStorage.getItem(
          `wf-employee-directory-filters:${userId}`,
        );
        if (!query && saved) {
          window.history.replaceState(null, "", `${pathname}?${saved}`);
          return;
        }
      }
      localStorage.setItem(`wf-employee-directory-filters:${userId}`, query);
    } catch {
      /* Storage can be unavailable in private browsing; URL filters still work. */
    }
  }, [query, pathname, router, userId]);
  const unsavedPrompt = useUnsavedChanges(
    open && JSON.stringify(form) !== JSON.stringify(emptyEmployeeForm),
  );
  const { confirm, confirmation } = useConfirm();
  useEffect(() => {
    const abort = new AbortController();
    api<DirectoryData>(`/api/workforce/employees?${query}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setData(result);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [query, revision]);
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(pendingQuery.current);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    pendingQuery.current = next.toString();
    setLoading(true);
    if (next.toString() === query) setRevision((v) => v + 1);
    else window.history.replaceState(null, "", `${pathname}?${next}`);
  };
  const close = async () => {
    if (saving) return;
    if (
      JSON.stringify(form) !== JSON.stringify(emptyEmployeeForm) &&
      !(await confirm("تجاهل بيانات الموظف غير المحفوظة؟"))
    )
      return;
    setOpen(false);
    setForm(emptyEmployeeForm);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const result = await api<{ id: string }>("/api/workforce/employees", {
        method: "POST",
        body: JSON.stringify({ ...form, request_key: requestKey.current }),
      });
      setForm(emptyEmployeeForm);
      setOpen(false);
      router.push(`/admin/workforce/employees/${result.id}`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      {unsavedPrompt}
      {confirmation}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-dark">إدارة الموظفين</h1>
        </div>
        <Button
          onClick={() => {
            requestKey.current = crypto.randomUUID();
            setForm(emptyEmployeeForm);
            setFormError("");
            setOpen(true);
          }}
        >
          إضافة موظف
        </Button>
      </div>
      <nav aria-label="إدارة الفريق" className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/workforce"
          className="rounded-full border border-border bg-white px-4 py-2"
        >
          داشبورد الفريق
        </Link>
        <Link
          href="/admin/workforce/tasks"
          className="rounded-full border border-border bg-white px-4 py-2"
        >
          المهام والعمل
        </Link>
        <span
          aria-current="page"
          className="rounded-full bg-dark px-4 py-2 text-white"
        >
          الموظفون
        </span>
        <Link
          href="/admin/workforce/approvals"
          className="rounded-full border border-border bg-white px-4 py-2"
        >
          طلبات تغيير البيانات
        </Link>
      </nav>
      <Notice message={error} error />
      {error && (
        <Button
          variant="outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          إعادة المحاولة
        </Button>
      )}
      <Panel title="دليل الفريق">
        <div className="mb-4 flex max-w-xs items-center gap-3">
          <label htmlFor="team-sort" className="shrink-0 text-sm font-bold">
            ترتيب حسب
          </label>
          <select
            id="team-sort"
            value={params.get("sort") ?? "recent"}
            onChange={(event) => filter("sort", event.target.value)}
            className={controlClass}
          >
            <option value="recent">الأحدث إضافة</option>
            <option value="name">الاسم</option>
            <option value="start">تاريخ الانضمام</option>
          </select>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            filter(
              "q",
              String(new FormData(event.currentTarget).get("q") ?? ""),
            );
          }}
          className="grid items-end gap-3 md:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <Field label="البحث بالاسم أو البريد أو المسمى" id="team-search">
            <input
              id="team-search"
              name="q"
              defaultValue={params.get("q") ?? ""}
              className={controlClass}
              placeholder="ابحث عن موظف…"
            />
          </Field>
          <Field label="الحالة" id="team-status">
            <select
              id="team-status"
              value={params.get("status") ?? ""}
              onChange={(event) => filter("status", event.target.value)}
              className={controlClass}
            >
              <option value="">جميع الحالات</option>
              {Object.entries(STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="القسم" id="team-department">
            <select
              id="team-department"
              value={params.get("department") ?? ""}
              onChange={(event) => filter("department", event.target.value)}
              className={controlClass}
            >
              <option value="">جميع الأقسام</option>
              {data?.departments.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="outline">
            بحث
          </Button>
        </form>
        {loading ? (
          <p role="status" className="py-10 text-center text-muted">
            جارٍ تحميل الموظفين…
          </p>
        ) : data?.employees.length ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {data.employees.map((employee) => (
              <Link
                key={employee.id}
                href={`/admin/workforce/employees/${employee.id}`}
                className="group rounded-xl border border-slate-200 bg-slate-50/60 p-5 transition hover:border-blue-400 hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-bold">
                      {employee.full_name}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {employee.job_title || "—"} ·{" "}
                      {data.departments.find(
                        (d) => d.id === employee.department_id,
                      )?.name || "دون قسم"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${employee.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                  >
                    {STATUS_LABELS[employee.status]}
                  </span>
                </div>
                <p
                  dir="ltr"
                  className="mt-4 break-all text-right text-sm text-muted"
                >
                  {employee.email}
                </p>
                <div className="mt-4 flex justify-between text-xs text-muted">
                  <span>انضم {formatDate(employee.start_date)}</span>
                  <span className="font-bold text-green">فتح الملف ←</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <h3 className="font-bold">لا يوجد موظفون في هذه القائمة</h3>
          </div>
        )}
        {data && data.count > 20 && (
          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={data.page === 1}
              onClick={() => filter("page", String(data.page - 1))}
            >
              السابق
            </Button>
            <span className="text-sm">
              صفحة {data.page} من {Math.ceil(data.count / 20)}
            </span>
            <Button
              variant="outline"
              disabled={data.page * 20 >= data.count}
              onClick={() => filter("page", String(data.page + 1))}
            >
              التالي
            </Button>
          </div>
        )}
      </Panel>
      <details className="rounded-2xl border border-border bg-white/70 p-5">
        <summary className="cursor-pointer font-bold">
          إدارة أقسام الشركة
        </summary>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (departmentBusy) return;
            setDepartmentBusy(true);
            setDepartmentMessage("");
            try {
              await api("/api/workforce/departments", {
                method: "POST",
                body: JSON.stringify({ name: departmentName }),
              });
              setDepartmentName("");
              setDepartmentMessage("تمت إضافة القسم");
              setRevision((v) => v + 1);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setDepartmentBusy(false);
            }
          }}
        >
          <Field label="اسم القسم الجديد" id="department-name">
            <input
              id="department-name"
              className={controlClass}
              required
              maxLength={100}
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline" loading={departmentBusy}>
            إضافة قسم
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {data?.departments.map((d) => (
            <span
              key={d.id}
              className="rounded-full bg-slate-100 px-3 py-1 text-sm"
            >
              {d.name}
            </span>
          ))}
        </div>
        <Notice message={departmentMessage} />
      </details>
      <Dialog title="إضافة موظف جديد" open={open} onClose={close}>
        <form onSubmit={submit} className="space-y-5">
          <EmployeeFields
            value={form}
            onChange={setForm}
            departments={data?.departments ?? []}
            creating
          />
          <Notice message={formError} error />
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>
              إنشاء حساب الموظف
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={saving}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
