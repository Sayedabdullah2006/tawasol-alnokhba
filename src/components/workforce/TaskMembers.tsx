"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { EmployeePicker } from "./TaskFields";
import {
  api,
  controlClass,
  Dialog,
  Field,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";
type Member = {
  employee_id: string;
  name: string;
  participation: "participant" | "watcher";
};
type Members = {
  version: number;
  canManage: boolean;
  sharedWithBoard: boolean;
  assignee: { employee_id: string; name: string } | null;
  members: Member[];
};
const serialize = (rows: Member[]) =>
  JSON.stringify(
    rows.map(({ employee_id, participation }) => ({
      employee_id,
      participation,
    })),
  );
export default function TaskMembers({
  taskId,
  taskVersion,
  onSaved,
}: {
  taskId: string;
  taskVersion: number;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Members | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Member[] | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [original, setOriginal] = useState("");
  const [chosen, setChosen] = useState({ id: "", name: "" });
  const [participation, setParticipation] =
    useState<Member["participation"]>("watcher");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retry = useRef({ payload: "", key: "" });
  const { confirm, confirmation } = useConfirm();
  const dirty = !!draft && serialize(draft) !== original;
  const unsaved = useUnsavedChanges(dirty || !!chosen.id);
  useEffect(() => {
    const abort = new AbortController();
    api<Members>(`/api/workforce/tasks/${taskId}/members`, {
      signal: abort.signal,
    })
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          if ([401, 403, 404].includes(e.status)) setData(null);
        }
      });
    return () => abort.abort();
  }, [taskId, taskVersion, reload]);
  const close = async () => {
    if (
      !busy &&
      (!(dirty || chosen.id) ||
        (await confirm("تجاهل تغييرات المشاركين غير المحفوظة؟")))
    ) {
      setDraft(null);
      setChosen({ id: "", name: "" });
    }
  };
  return (
    <Panel
      title="المسؤول والمشاركون"
      description="المشارك ينفذ العمل ويسلم النتيجة، والمتابع يقرأ دون تعديل. إدارة الوصول والاعتماد للمدير."
    >
      {confirmation}
      {unsaved}
      <Notice message={error} error />
      <Notice message={message} />
      {!data ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setReload((n) => n + 1)}
        >
          تحميل المشاركين
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-bold">
            المسؤول الأساسي: {data.assignee?.name ?? "لم يسند بعد"}
          </p>
          <ul className="space-y-2">
            {data.members.map((member) => (
              <li
                key={member.employee_id}
                className="flex flex-wrap justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <span>{member.name}</span>
                <span>
                  {member.participation === "participant"
                    ? "مشارك في التنفيذ"
                    : "متابع للقراءة"}
                </span>
              </li>
            ))}
          </ul>
          {!data.members.length && (
            <p className="text-sm text-muted">
              لا يوجد مشاركون إضافيون أو متابعون.
            </p>
          )}
          <p className="text-sm text-muted">
            {data.sharedWithBoard
              ? "المهمة مشتركة أيضًا مع أعضاء اللوحة؛ إزالة مشاركة موظف لا تلغي وصوله للقراءة من عضوية اللوحة."
              : "المهمة غير مشتركة مع جميع أعضاء اللوحة."}{" "}
            المسؤول الأساسي ومنشئ المهمة يحتفظان بوصولهما حسب التكليف.
          </p>
          {data.canManage && (
            <Button
              type="button"
              onClick={() => {
                setDraft(data.members);
                setOriginal(serialize(data.members));
                setDraftVersion(data.version);
                setError("");
                setChosen({ id: "", name: "" });
              }}
            >
              إدارة المشاركين والمتابعين
            </Button>
          )}
        </div>
      )}
      <Dialog
        title="مشاركو المهمة ومتابعوها"
        open={draft !== null}
        onClose={close}
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const payload = {
                  members: draft.map(({ employee_id, participation }) => ({
                    employee_id,
                    participation,
                  })),
                };
                const serialized = JSON.stringify({
                  taskId,
                  version: draftVersion,
                  payload,
                });
                if (retry.current.payload !== serialized)
                  retry.current = {
                    payload: serialized,
                    key: crypto.randomUUID(),
                  };
                await api("/api/workforce/members", {
                  method: "POST",
                  body: JSON.stringify({
                    id: taskId,
                    version: draftVersion,
                    command: "save",
                    payload,
                    request_key: retry.current.key,
                  }),
                });
                setDraft(null);
                setChosen({ id: "", name: "" });
                setMessage("تم حفظ المشاركين وصلاحياتهم داخل المهمة");
                setReload((n) => n + 1);
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <p className="text-sm leading-7">
              المشارك يستطيع تحديث التنفيذ والتحقق والتعليق والتسليم، ولا يغير
              تكليف المدير أو يعتمد التسليم. المتابع يقرأ التفاصيل والنقاش
              والتاريخ فقط. إضافة شخص لا تكشف راتب المسؤول أو ملفه الخاص.
            </p>
            <EmployeePicker
              value={chosen.id}
              onChange={(id, name) => setChosen({ id, name: name ?? "موظف" })}
              title="إضافة شخص للمهمة"
              selectLabel="اختيار مشارك أو متابع"
            />
            <Field label="نوع المشاركة الجديدة" id="new-participation">
              <select
                id="new-participation"
                className={controlClass}
                value={participation}
                disabled={busy}
                onChange={(e) =>
                  setParticipation(e.target.value as Member["participation"])
                }
              >
                <option value="watcher">متابع للقراءة</option>
                <option value="participant">مشارك في التنفيذ</option>
              </select>
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={
                busy ||
                !chosen.id ||
                chosen.id === data?.assignee?.employee_id ||
                draft.some((row) => row.employee_id === chosen.id) ||
                draft.length >= 100
              }
              onClick={() => {
                setDraft([
                  ...draft,
                  { employee_id: chosen.id, name: chosen.name, participation },
                ]);
                setChosen({ id: "", name: "" });
              }}
            >
              إضافة إلى المشاركين
            </Button>
            {chosen.id === data?.assignee?.employee_id && (
              <p className="text-sm text-muted">
                المسؤول الأساسي لديه صلاحية التنفيذ بالفعل.
              </p>
            )}
            <ul className="space-y-3">
              {draft.map((member) => (
                <li
                  key={member.employee_id}
                  className="space-y-3 rounded-xl border border-border p-3"
                >
                  <p className="font-bold">{member.name}</p>
                  <Field
                    label={`صلاحية ${member.name}`}
                    id={`participation-${member.employee_id}`}
                  >
                    <select
                      id={`participation-${member.employee_id}`}
                      className={controlClass}
                      disabled={busy}
                      value={member.participation}
                      onChange={(e) =>
                        setDraft(
                          draft.map((row) =>
                            row.employee_id === member.employee_id
                              ? {
                                  ...row,
                                  participation: e.target
                                    .value as Member["participation"],
                                }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="watcher">متابع للقراءة</option>
                      <option value="participant">مشارك في التنفيذ</option>
                    </select>
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`إزالة ${member.name} من المهمة`}
                    onClick={() =>
                      setDraft(
                        draft.filter(
                          (row) => row.employee_id !== member.employee_id,
                        ),
                      )
                    }
                  >
                    إزالة من المشاركين
                  </Button>
                </li>
              ))}
            </ul>
            <Notice message={error} error />
            <Button
              type="submit"
              loading={busy}
              disabled={!dirty || !!chosen.id}
            >
              حفظ المشاركين والمتابعين
            </Button>
            {!!chosen.id && (
              <p className="text-sm text-muted">
                أضف الشخص المختار إلى القائمة أو ألغِ اختياره قبل الحفظ.
              </p>
            )}
          </form>
        )}
      </Dialog>
    </Panel>
  );
}
