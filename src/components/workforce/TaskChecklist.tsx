"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { type ChecklistItem, workDate } from "@/lib/workforce/task-types";
import {
  controlClass,
  Dialog,
  Field,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

type Draft = {
  id: string;
  title: string;
  required: boolean;
  version: number;
  original: string;
  adding: boolean;
};
export default function TaskChecklist({
  items,
  version,
  canEdit,
  canWork,
  frozen,
  busy,
  error,
  command,
}: {
  items: ChecklistItem[];
  version: number;
  canEdit: boolean;
  canWork: boolean;
  frozen: boolean;
  busy: boolean;
  error: string;
  command: (
    name: string,
    payload: Record<string, unknown>,
    success: string,
    version: number,
  ) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const { confirm, confirmation } = useConfirm();
  const dirty =
    !!draft && JSON.stringify([draft.title, draft.required]) !== draft.original;
  const unsaved = useUnsavedChanges(dirty);
  const close = async () => {
    if (!busy && (!dirty || (await confirm("تجاهل بند التحقق غير المحفوظ؟"))))
      setDraft(null);
  };
  const open = (item?: ChecklistItem) =>
    setDraft({
      id: item?.id ?? crypto.randomUUID(),
      title: item?.title ?? "",
      required: item?.required ?? true,
      original: JSON.stringify([item?.title ?? "", item?.required ?? true]),
      version,
      adding: !item,
    });
  const required = items.filter((item) => item.required);
  return (
    <Panel
      title="قائمة التحقق"
      description="المدير يحدد بنود التكليف، والمنفذ يسجل إنجازها. البنود المطلوبة تمنع التسليم حتى تكتمل."
    >
      {confirmation}
      {unsaved}
      <div className="space-y-4">
        <p className="text-sm">
          المطلوب: {required.filter((item) => item.completed).length} من{" "}
          {required.length} مكتمل · جميع البنود:{" "}
          {items.filter((item) => item.completed).length} من {items.length}
        </p>
        {!items.length && (
          <p className="text-sm text-muted">لم تضف بنود تحقق لهذه المهمة.</p>
        )}
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border p-3">
              <label className="flex items-start gap-3 text-sm leading-7">
                <input
                  type="checkbox"
                  className="mt-2 h-4 w-4 shrink-0"
                  checked={item.completed}
                  disabled={!canWork || frozen || busy}
                  onChange={(e) =>
                    void command(
                      "toggle",
                      { item_id: item.id, completed: e.target.checked },
                      "تم تحديث بند التحقق",
                      version,
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {item.title}
                  <span className="ms-2 font-bold">
                    ({item.required ? "مطلوب" : "اختياري"})
                  </span>
                </span>
              </label>
              {item.completed_at && (
                <p className="mt-1 text-xs text-muted">
                  اكتمل: {workDate(item.completed_at)}
                </p>
              )}
              {canEdit && !frozen && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    aria-label={`تعديل بند ${item.title}`}
                    onClick={() => open(item)}
                  >
                    تعديل البند
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    aria-label={`إزالة بند ${item.title}`}
                    onClick={async () => {
                      if (
                        await confirm(
                          "إزالة هذا البند من شروط المهمة؟ يبقى أثر الإزالة في سجل النشاط.",
                        )
                      )
                        await command(
                          "remove",
                          { item_id: item.id },
                          "تمت إزالة البند وتوثيقه",
                          version,
                        );
                    }}
                  >
                    إزالة البند
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit && !frozen && (
          <Button
            type="button"
            disabled={busy || items.length >= 200}
            onClick={() => open()}
          >
            إضافة بند تحقق
          </Button>
        )}
        {frozen && (
          <p className="text-sm text-muted">
            قائمة التحقق للقراءة في حالة المراجعة أو الإكمال أو الأرشفة.
          </p>
        )}
      </div>
      <Dialog
        title={draft?.adding ? "إضافة بند تحقق" : "تعديل بند تحقق"}
        open={!!draft}
        onClose={close}
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await command(
                  draft.adding ? "add" : "edit",
                  {
                    item_id: draft.id,
                    title: draft.title,
                    required: draft.required,
                  },
                  draft.adding
                    ? "تمت إضافة بند التحقق"
                    : "تم تعديل البند؛ تحقق من إنجازه من جديد",
                  draft.version,
                )
              )
                setDraft(null);
            }}
          >
            <Field label="وصف بند التحقق" id="checklist-title">
              <textarea
                id="checklist-title"
                className={controlClass}
                required
                maxLength={500}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) =>
                  setDraft({ ...draft, required: e.target.checked })
                }
              />
              مطلوب قبل التسليم
            </label>
            {!draft.adding && (
              <p className="text-sm text-muted">
                حفظ التعديل يعيد البند إلى غير مكتمل للتحقق منه مجددًا.
              </p>
            )}
            <Notice message={error} error />
            <Button type="submit" loading={busy} disabled={!draft.title.trim()}>
              حفظ بند التحقق
            </Button>
          </form>
        )}
      </Dialog>
    </Panel>
  );
}
