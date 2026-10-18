"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { FIELD_LABELS, type ProfileChange } from "@/lib/workforce/types";
import {
  api,
  controlClass,
  Field,
  formatDate,
  Notice,
  Panel,
  useUnsavedChanges,
} from "./shared";
type RequestRow = ProfileChange & { wf_employees: { full_name: string } };
export default function ProfileApprovals() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const unsavedWarning = useUnsavedChanges(
    Object.values(reasons).some((value) => value.trim().length > 0),
  );
  useEffect(() => {
    const abort = new AbortController();
    api<{ requests: RequestRow[]; count: number }>(
      `/api/workforce/profile-changes?page=${page}`,
      {
        signal: abort.signal,
      },
    )
      .then((data) => {
        if (page > 1 && data.requests.length === 0) {
          setPage(Math.max(1, Math.ceil(data.count / 20)));
          return;
        }
        setRequests(data.requests);
        setCount(data.count);
        setLoading(false);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [revision, page]);
  const changePage = (next: number) => {
    setLoading(true);
    setPage(next);
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      {unsavedWarning}
      <Notice message={error} error />
      <Notice message={message} />
      <p className="text-sm text-muted">{count} طلب بانتظار القرار</p>
      {error && (
        <Button onClick={() => setRevision((v) => v + 1)}>
          إعادة المحاولة
        </Button>
      )}
      {loading ? (
        <p role="status">جارٍ تحميل الطلبات…</p>
      ) : requests.length === 0 ? (
        <Panel title="لا توجد طلبات معلقة">
          <p className="text-sm text-muted">
            ستظهر هنا طلبات الموظفين الجديدة التي تحتاج قرارك.
          </p>
        </Panel>
      ) : (
        requests.map((request) => (
          <Panel
            key={request.id}
            title={`${request.wf_employees.full_name} · ${FIELD_LABELS[request.field]}`}
          >
            <time className="text-xs text-muted">
              {formatDate(request.created_at)}
            </time>
            <p className="break-all text-lg font-bold">
              {request.proposed_value}
            </p>
            <p className="mt-3 text-sm leading-7 text-muted">
              السبب: {request.reason}
            </p>
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const submitter = (event.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement;
                const decision = submitter?.value;
                if (!["approved", "rejected"].includes(decision)) return;
                const reason = new FormData(event.currentTarget).get("reason");
                setBusy(request.id);
                setError("");
                try {
                  await api("/api/workforce/profile-changes", {
                    method: "PATCH",
                    body: JSON.stringify({ id: request.id, decision, reason }),
                  });
                  setReasons((current) => {
                    const next = { ...current };
                    delete next[request.id];
                    return next;
                  });
                  setMessage(
                    decision === "approved"
                      ? "تم الاعتماد وتحديث بيانات الموظف"
                      : "تم رفض الطلب مع تسجيل السبب",
                  );
                  setRevision((v) => v + 1);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              <Field label="سبب القرار" id={`reason-${request.id}`}>
                <textarea
                  value={reasons[request.id] || ""}
                  onChange={(event) =>
                    setReasons((current) => ({
                      ...current,
                      [request.id]: event.target.value,
                    }))
                  }
                  name="reason"
                  id={`reason-${request.id}`}
                  className={controlClass}
                  required
                  minLength={3}
                  maxLength={2000}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  value="approved"
                  disabled={!!busy}
                  loading={busy === request.id}
                >
                  اعتماد التغيير
                </Button>
                <Button
                  type="submit"
                  value="rejected"
                  variant="outline"
                  disabled={!!busy}
                >
                  رفض الطلب
                </Button>
                <Link
                  href={`/admin/workforce/employees/${request.employee_id}`}
                  className="self-center text-sm font-bold"
                >
                  فتح الملف
                </Link>
              </div>
            </form>
          </Panel>
        ))
      )}
      <nav
        aria-label="صفحات طلبات تغيير البيانات"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <Button
          variant="outline"
          disabled={loading || !!busy || page === 1}
          onClick={() => changePage(page - 1)}
        >
          السابق
        </Button>
        <span className="text-sm">
          الصفحة {page} من {Math.max(1, Math.ceil(count / 20))}
        </span>
        <Button
          variant="outline"
          disabled={loading || !!busy || page * 20 >= count}
          onClick={() => changePage(page + 1)}
        >
          التالي
        </Button>
      </nav>
    </div>
  );
}
