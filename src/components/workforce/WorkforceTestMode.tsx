"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { api, Notice, Panel } from "./shared";
type Run = { id: string; active: boolean; expires_at: string };
export default function WorkforceTestMode({
  admin = false,
  compact = false,
  joinRun,
}: {
  admin?: boolean;
  compact?: boolean;
  joinRun?: string;
}) {
  const [run, setRun] = useState<Run | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      api<{ run: Run | null }>("/api/workforce/test-mode")
        .then((r) => {
          if (!stopped) {
            setRun(r.run);
            setReady(true);
          }
        })
        .catch(() => {
          if (!stopped) setReady(true);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("workforce-test-mode", refresh);
    return () => {
      stopped = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("workforce-test-mode", refresh);
    };
  }, []);
  async function change(action: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ run: Run | null }>(
        "/api/workforce/test-mode",
        {
          method: "POST",
          body: JSON.stringify({
            action,
            run: action === "join" ? joinRun : run?.id,
          }),
        },
      );
      setRun(result.run);
      window.dispatchEvent(new Event("workforce-test-mode"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (compact)
    return run ? (
      <Link
        href={admin ? "/admin/workforce/notifications" : "/employee/testing"}
        className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"
      >
        {run.active ? "اختبار · دون إشعارات" : "انتهى الاختبار · اخرج من الوضع"}
      </Link>
    ) : null;
  return (
    <Panel title="وضع الاختبار" tone="amber">
      <div className="space-y-4">
        <Notice message={error} error />
        {!ready ? (
          <p role="status">جارٍ التحقق…</p>
        ) : run ? (
          <>
            <p className="font-bold">
              {run.active
                ? "المهام والطلبات الإدارية الجديدة · دون إشعارات أو بريد"
                : "انتهت الجولة · إنشاء بيانات الاختبار متوقف"}
            </p>
            <p className="text-xs text-muted">
              حتى{" "}
              {new Date(run.expires_at).toLocaleTimeString("ar-SA", {
                timeZone: "Asia/Riyadh",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {admin && run.active && (
              <div className="space-y-2">
                <label htmlFor="test-run-link" className="text-sm font-bold">
                  رابط دخول الموظفات للاختبار
                </label>
                <input
                  id="test-run-link"
                  readOnly
                  dir="ltr"
                  className="w-full rounded-xl border bg-white p-3 text-xs"
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/employee/testing?run=${run.id}`}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {admin && (
                <Button disabled={busy} onClick={() => void change("finish")}>
                  إنهاء الجولة
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void change("leave")}
              >
                الخروج من وضع الاختبار
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            {admin && (
              <Button disabled={busy} onClick={() => void change("start")}>
                بدء جولة اختبار صامتة
              </Button>
            )}
            {joinRun && (
              <Button disabled={busy} onClick={() => void change("join")}>
                الدخول إلى الاختبار الصامت
              </Button>
            )}
            {!admin && !joinRun && (
              <p className="text-sm">
                يفتح المدير الجولة ويعطيك رابط الاختبار.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
