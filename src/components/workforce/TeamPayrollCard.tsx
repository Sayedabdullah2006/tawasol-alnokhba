"use client";
import { useEffect, useState } from "react";
import type { PayrollCardData } from "@/lib/workforce/payroll-attendance";
import PayrollCard from "./PayrollCard";
import { api } from "./shared";
import Button from "@/components/ui/Button";

export default function TeamPayrollCard({ employeeId, name, month, refreshKey, preview = false, previewPayroll = null, onOpen }: {
  employeeId: string; name: string; month: string; refreshKey: string; preview?: boolean; previewPayroll?: PayrollCardData | null; onOpen: () => void;
}) {
  const key = `${employeeId}:${month}:${refreshKey}`;
  const [result, setResult] = useState<{ key: string; statement: PayrollCardData | null; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return;
    const abort = new AbortController();
    api<{ statement: PayrollCardData | null }>(`/api/workforce/employees/${employeeId}/payroll?month=${month}`, { signal: abort.signal })
      .then(value => setResult({ key, statement: value.statement }))
      .catch(error => { if (error.name !== "AbortError") setResult({ key, statement: null, error: error.message }); });
    return () => abort.abort();
  }, [employeeId, month, key, preview, retry]);
  const current = result?.key === key ? result : null;
  return <div className="flex min-w-0 flex-col gap-3" data-team-payroll={employeeId}>
    {!preview && !current ? <div role="status" className="min-h-64 animate-pulse rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6 motion-reduce:animate-none">جارٍ تحميل مستحقات {name}…</div>
      : current?.error ? <div role="alert" className="rounded-3xl border border-rose-200 p-6"><p>{current.error}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>إعادة المحاولة</Button></div>
      : <PayrollCard initial={preview ? previewPayroll : current?.statement ?? null} month={month} preview title={`مستحقات ${name}`} cardId={`team-payroll-${employeeId}`} />}
    <Button variant="outline" disabled={preview || !current || !!current.error} onClick={onOpen}>فتح كشف {name}</Button>
  </div>;
}
