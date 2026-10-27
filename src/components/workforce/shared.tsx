"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";

export const controlClass =
  "w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:bg-slate-100";
export function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-bold text-dark">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-6 text-muted">{hint}</p>}
    </div>
  );
}
export function Panel({
  title,
  description,
  children,
  tone = "white",
}: {
  title: string;
  description?: string;
  tone?: "white" | "sky" | "violet" | "emerald" | "amber";
  children: ReactNode;
}) {
  return (
    <section
      className={`portal-panel rounded-3xl border p-5 shadow-sm md:p-6 ${{ white: "border-border bg-white/90", sky: "border-sky-200 bg-sky-50", violet: "border-violet-200 bg-violet-50", emerald: "border-emerald-200 bg-emerald-50", amber: "border-amber-200 bg-amber-50" }[tone]}`}
    >
      <h2 className="text-lg font-bold text-dark">{title}</h2>
      {description && (
        <p className="mt-1 text-sm leading-7 text-muted">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  if (!message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-xl border p-3 text-sm leading-7 ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {message}
    </p>
  );
}
export function Dialog({
  title,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${wide?'max-w-5xl':'max-w-2xl'} overflow-y-auto rounded-2xl border border-border bg-white p-5 text-dark shadow-2xl backdrop:bg-slate-950/50 md:p-7`}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="إغلاق النافذة"
          onClick={onClose}
        >
          إغلاق
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  if (typeof window !== "undefined" && options?.method && !["GET","HEAD"].includes(options.method.toUpperCase())) {
    const attempt = new CustomEvent("workforce-action-attempt", {cancelable:true,detail:{url,options,message:""}});
    if (!window.dispatchEvent(attempt)) throw new Error(attempt.detail.message || "سجلي الحضور لبدء العمل");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const forwardAbort = () => controller.abort();
  if (options?.signal?.aborted) controller.abort();
  options?.signal?.addEventListener("abort", forwardAbort, { once: true });
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
      headers: {
        ...(options?.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options?.headers,
      },
    });
  } catch (error) {
    if (options?.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
    throw new Error(
      error instanceof Error && error.name === "AbortError"
        ? "استغرق الاتصال وقتًا طويلًا. تحقق من النتيجة قبل إعادة الإرسال."
        : "تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة.",
    );
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", forwardAbort);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "تعذر إتمام الطلب؛ أعد المحاولة"),
      { status: response.status },
    );
  return result as T;
}
export function useConfirm() {
  const [question, setQuestion] = useState("");
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  const confirm = (message: string) =>
    new Promise<boolean>((done) => {
      resolve.current?.(false);
      resolve.current = done;
      setQuestion(message);
    });
  const finish = (accepted: boolean) => {
    setQuestion("");
    resolve.current?.(accepted);
    resolve.current = null;
  };
  const confirmation = (
    <Dialog
      title="تأكيد الإجراء"
      open={!!question}
      onClose={() => finish(false)}
    >
      <p className="text-sm leading-8">{question}</p>
      <div className="mt-5 flex gap-3">
        <Button type="button" onClick={() => finish(true)}>
          تأكيد المتابعة
        </Button>
        <Button type="button" variant="outline" onClick={() => finish(false)}>
          العودة دون تغيير
        </Button>
      </div>
    </Dialog>
  );
  return { confirm, confirmation };
}
const dirtyForms = new Set<symbol>();
export const hasUnsavedWorkforceChanges = () => dirtyForms.size > 0;
export function useUnsavedChanges(dirty: boolean) {
  const token = useRef(Symbol());
  useEffect(() => {
    const key = token.current;
    if (dirty) dirtyForms.add(key);
    return () => {
      dirtyForms.delete(key);
    };
  }, [dirty]);
  const { confirm, confirmation } = useConfirm();
  const skip = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!skip.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        anchor.target === "_blank"
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void confirm(
        "لديك تغييرات غير محفوظة. هل تريد مغادرة الصفحة وتجاهلها؟",
      ).then((accepted) => {
        if (accepted) {
          skip.current = true;
          window.location.assign(anchor.href);
        }
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, confirm]);
  return confirmation;
}
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        calendar: "gregory",
        timeZone: "Asia/Riyadh",
      }).format(new Date(value))
    : "غير محدد";
}
