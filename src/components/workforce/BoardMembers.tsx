"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { EmployeePicker } from "./TaskFields";
import { api, Dialog, Notice, useConfirm, useUnsavedChanges } from "./shared";
type Member = { employee_id: string; employee: { full_name: string } };
export default function BoardMembers({
  boardId,
  onClose,
  onSaved,
}: {
  boardId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [original, setOriginal] = useState("");
  const [chosen, setChosen] = useState({ id: "", name: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const retry = useRef({ payload: "", key: "" });
  const lock = useRef(false);
  const { confirm, confirmation } = useConfirm();
  const dirty =
    version !== null &&
    JSON.stringify(members.map((m) => m.employee_id)) !== original;
  const unsaved = useUnsavedChanges(dirty);
  useEffect(() => {
    const abort = new AbortController();
    api<{ version: number; members: Member[] }>(
      `/api/workforce/boards/${boardId}/members`,
      { signal: abort.signal },
    )
      .then((result) => {
        setMembers(result.members);
        setOriginal(JSON.stringify(result.members.map((m) => m.employee_id)));
        setVersion(result.version);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [boardId, reload]);
  const close = async () => {
    if (
      !busy &&
      (!dirty || (await confirm("تجاهل تغييرات عضوية اللوحة غير المحفوظة؟")))
    )
      onClose();
  };
  return (
    <>
      {confirmation}
      {unsaved}
      <Dialog title="أعضاء لوحة العمل" open onClose={close}>
        <div className="space-y-4">
          <Notice message={error} error />
          {version === null ? (
            <Button type="button" onClick={() => setReload((n) => n + 1)}>
              تحميل الأعضاء
            </Button>
          ) : (
            <>
              <EmployeePicker
                value={chosen.id}
                onChange={(id, name) => setChosen({ id, name: name ?? "موظف" })}
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  !chosen.id ||
                  busy ||
                  members.length >= 500 ||
                  members.some((m) => m.employee_id === chosen.id)
                }
                onClick={() => {
                  setMembers([
                    ...members,
                    {
                      employee_id: chosen.id,
                      employee: { full_name: chosen.name },
                    },
                  ]);
                  setChosen({ id: "", name: "" });
                }}
              >
                إضافة العضو إلى القائمة
              </Button>
              <ul className="space-y-2">
                {members.map((m) => (
                  <li
                    key={m.employee_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <span>{m.employee.full_name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`إزالة ${m.employee.full_name} من أعضاء اللوحة`}
                      onClick={() =>
                        setMembers(
                          members.filter(
                            (row) => row.employee_id !== m.employee_id,
                          ),
                        )
                      }
                    >
                      إزالة
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                loading={busy}
                disabled={!dirty}
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  try {
                    const payload = {
                      employee_ids: members.map((m) => m.employee_id),
                    };
                    const serialized = JSON.stringify({ version, payload });
                    if (serialized !== retry.current.payload)
                      retry.current = {
                        payload: serialized,
                        key: crypto.randomUUID(),
                      };
                    await api("/api/workforce/boards", {
                      method: "POST",
                      body: JSON.stringify({
                        id: boardId,
                        version,
                        command: "members",
                        payload,
                        request_key: retry.current.key,
                      }),
                    });
                    onSaved();
                    onClose();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                    lock.current = false;
                  }
                }}
              >
                حفظ أعضاء اللوحة
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
