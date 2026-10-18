"use client";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import {
  workDate,
  type TaskHistory as History,
} from "@/lib/workforce/task-types";
import { api, Notice, Panel } from "./shared";
import TaskAttachments from "./TaskAttachments";

const actions: Record<string, string> = {
  "attachment:add": "إضافة مرفق",
  "attachment:archive": "أرشفة مرفق",
  "attachment:restore": "استعادة مرفق",
  "time:create": "تسجيل وقت عمل",
  "time:edit": "تصحيح وقت عمل",
  "time:archive": "أرشفة وقت عمل",
  "time:restore": "استعادة وقت عمل",
  "members:save": "تحديث المشاركين والمتابعين",
  "members:primary": "تحديث مشاركة المسؤول الأساسي",
  "comment:create": "نشر تعليق",
  "comment:edit": "تعديل تعليق",
  "comment:archive": "أرشفة تعليق",
  "comment:restore": "استعادة تعليق",
  INSERT: "إنشاء المهمة",
  UPDATE: "تحديث المهمة",
  "checklist:add": "إضافة بند تحقق",
  "checklist:edit": "تعديل بند وإعادة التحقق منه",
  "checklist:toggle": "تحديث إنجاز بند",
  "checklist:remove": "إزالة بند تحقق",
};
const fields: Record<string, string> = {
  attachments: "المرفقات",
  time: "سجل الوقت",
  members: "المشاركون والمتابعون",
  comments: "التعليقات",
  title: "العنوان",
  description: "الوصف",
  completion_criteria: "معيار الإنجاز",
  assignee_id: "المسؤول",
  column_id: "الحالة",
  priority: "الأولوية",
  starts_at: "البداية",
  due_at: "موعد التسليم",
  estimate_minutes: "الوقت التقديري",
  requires_approval: "شرط الاعتماد",
  shared_with_board: "المشاركة",
  blocked_reason: "العائق",
  archived_at: "الأرشفة",
  completed_at: "وقت الإكمال",
  position: "الترتيب",
  checklist: "قائمة التحقق",
};
export default function TaskHistory({
  id,
  version,
  refreshKey = 0,
}: {
  id: string;
  version: number;
  refreshKey?: number;
}) {
  const [kind, setKind] = useState("events");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api<History>(
      `/api/workforce/tasks/${id}/history?kind=${kind}&page=${page}`,
      { signal: abort.signal },
    )
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [id, version, kind, page, retry, refreshKey]);
  const change = (next: string) => {
    if (next === kind) return;
    setKind(next);
    setPage(1);
    setData(null);
    setError("");
  };
  return (
    <Panel
      title="سجل المهمة والتسليمات"
      description="يمكن للطرفين الرجوع إلى محاولات التسليم وقراراتها السابقة."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={kind === "events"}
            onClick={() => change("events")}
          >
            سجل النشاط
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={kind === "submissions"}
            onClick={() => change("submissions")}
          >
            محاولات التسليم
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setData(null);
              setRetry((n) => n + 1);
            }}
          >
            تحديث السجل
          </Button>
        </div>
        <Notice message={error} error />
        {error && (
          <Button type="button" onClick={() => setRetry((n) => n + 1)}>
            إعادة تحميل السجل
          </Button>
        )}
        {!error && !data && <p role="status">جارٍ تحميل السجل…</p>}
        {!error && data && (
          <>
            {data.count === 0 && (
              <p className="text-sm text-muted">
                لا توجد {kind === "events" ? "أحداث" : "تسليمات"} مسجلة بعد.
              </p>
            )}
            <ol className="space-y-3">
              {data.events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-xl border border-border p-4 text-sm leading-7"
                >
                  <p className="font-bold">
                    {actions[event.action] ?? "إجراء على المهمة"} ·{" "}
                    {event.actorName}
                  </p>
                  <p className="text-muted">{workDate(event.created_at)}</p>
                  {event.summary && (
                    <p className="whitespace-pre-wrap break-words">
                      {event.summary}
                    </p>
                  )}
                  {event.changed_fields.length > 0 && (
                    <p>
                      الحقول:{" "}
                      {event.changed_fields
                        .map((field) => fields[field] ?? "تفاصيل العمل")
                        .join("، ")}
                    </p>
                  )}
                </li>
              ))}
              {data.submissions.map((submission, index) => (
                <li
                  key={submission.id}
                  className="space-y-2 rounded-xl border border-border p-4 text-sm leading-7"
                >
                  <h3 className="font-bold">
                    محاولة {data.count - (page - 1) * 20 - index} ·{" "}
                    {
                      {
                        pending: "بانتظار المراجعة",
                        changes: "أعيدت للتعديل",
                        approved: "معتمدة",
                      }[submission.status]
                    }
                  </h3>
                  <p className="text-muted">
                    التسليم: {workDate(submission.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {submission.summary}
                  </p>
                  {submission.decision_reason && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="font-bold">
                        قرار المدير · {workDate(submission.decided_at)}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {submission.decision_reason}
                      </p>
                    </div>
                  )}
                  <TaskAttachments
                    taskId={id}
                    submissionId={submission.id}
                    version={version}
                  />
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-3 text-sm">
              <Button
                type="button"
                variant="outline"
                disabled={page === 1}
                onClick={() => {
                  setData(null);
                  setPage((n) => n - 1);
                }}
              >
                أحداث أحدث
              </Button>
              <span>
                صفحة {page} · {data.count} سجل
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page * 20 >= data.count}
                onClick={() => {
                  setData(null);
                  setPage((n) => n + 1);
                }}
              >
                أحداث أقدم
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
