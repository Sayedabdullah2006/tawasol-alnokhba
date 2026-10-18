"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, controlClass, Notice } from "./shared";
import Button from "@/components/ui/Button";
import { fromCents, itemAmount, moneyCents, type PayrollData, type PayrollStatement } from "@/lib/workforce/payroll";

type History = { rows: Pick<PayrollStatement, "id" | "month" | "status" | "total_amount" | "paid_amount">[]; count: number };
const status = { draft: "مسودة", approved: "معتمد", paid: "مصروف" };
const money = (value: string) => `${Number(value).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const monthName = (month: string) => new Date(`${month.slice(0, 7)}-01T12:00:00+03:00`).toLocaleDateString("ar-SA", { calendar: "gregory", year: "numeric", month: "long", timeZone: "Asia/Riyadh" });
export default function EmployeeFinanceRecords({ employeeId, section }: { employeeId: string; section: "payslips" | "commissions" }) {
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }).slice(0, 7));
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<History | null>(null), [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [loaded, setLoaded] = useState(""), [error, setError] = useState("");
  const key = `${employeeId}:${section}:${month}:${page}:${revision}`, loading = loaded !== key;
  useEffect(() => {
    const abort = new AbortController();
    const query = section === "payslips" ? `history=true&page=${page}` : `month=${month}`;
    api<History | PayrollData>(`/api/workforce/employees/${employeeId}/payroll?${query}`, { signal: abort.signal })
      .then(result => { if (section === "payslips") setHistory(result as History); else setPayroll(result as PayrollData); setError(""); setLoaded(key); })
      .catch(e => { if (e.name !== "AbortError") { setHistory(null); setPayroll(null); setError(e.message); setLoaded(key); } });
    return () => abort.abort();
  }, [employeeId, section, month, page, key]);
  const statement = payroll?.statement, items = statement?.items || [];
  const total = fromCents(items.reduce((sum, item) => sum + moneyCents(item.amount ?? itemAmount(item)), BigInt(0)));
  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-black text-dark">{section === "payslips" ? "كشوف الرواتب" : "العمولات والمكافآت"}</h1>
      <Button variant="outline" disabled={loading} onClick={() => setRevision(n => n + 1)}>تحديث</Button>
    </header>
    {section === "commissions" && <label className="flex max-w-xs items-center gap-3 text-sm font-bold">الشهر<input type="month" aria-label="شهر العمولات" className={controlClass} value={month} min="2000-01" max="2100-12" onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} /></label>}
    <Notice message={error} error />
    {loading ? <p role="status">جارٍ التحميل…</p> : !error && (section === "payslips" ? <>
      <div className="grid gap-4 md:grid-cols-2">{history?.rows.map(row => <Link key={row.id} href={`/employee/finance/overview?month=${row.month.slice(0, 7)}`} className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-100 p-5 text-blue-950 hover:border-blue-400">
        <div className="flex justify-between gap-3"><h2 className="font-bold">{monthName(row.month)}</h2><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{status[row.status]}</span></div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt>الصافي</dt><dd className="mt-2 font-black">{money(row.total_amount)}</dd></div><div><dt>المصروف</dt><dd className="mt-2 font-black">{money(row.paid_amount)}</dd></div></dl><span className="mt-5 block text-sm font-bold">فتح الكشف ←</span>
      </Link>)}</div>
      {!history?.rows.length && <p className="rounded-2xl border bg-white p-5 text-sm">لا توجد كشوف رواتب</p>}
      {!!history?.count && history.count > 20 && <nav aria-label="صفحات كشوف الرواتب" className="flex items-center gap-3"><Button disabled={page === 1} onClick={() => setPage(n => n - 1)}>السابق</Button><span>{page} / {Math.ceil(history.count / 20)}</span><Button disabled={page * 20 >= history.count} onClick={() => setPage(n => n + 1)}>التالي</Button></nav>}
    </> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><span className="font-bold">{monthName(month)}</span><strong className="text-xl">{money(total)}</strong>{statement && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{status[statement.status]}</span>}</div>
      <div className="grid gap-4 md:grid-cols-2">{items.map((item, index) => <article key={index} className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950"><h2 className="font-bold">{item.title}</h2><p className="mt-3 text-xl font-black">{money(item.amount ?? itemAmount(item))}</p>{item.mode === "percent" && <p className="mt-3 text-sm">{item.value}٪ × {money(item.basis_amount)}</p>}{item.reference && <p className="mt-3 break-words text-sm">{item.reference}</p>}{item.task_id && <Link className="mt-4 block text-sm font-bold" href={`/employee/work/tasks/${item.task_id}`}>المهمة المرتبطة ←</Link>}</article>)}</div>
      {!items.length && <p className="rounded-2xl border bg-white p-5 text-sm">لا توجد عمولات أو مكافآت لهذا الشهر</p>}
      <Link href={`/employee/finance/overview?month=${month}`} className="inline-block text-sm font-bold text-dark">كشف الشهر ←</Link>
    </>)}
  </div>;
}
