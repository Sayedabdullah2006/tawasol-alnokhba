"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Button from "@/components/ui/Button";
import { cardPublicUrl, socialPlatforms, type CardEditorData } from "@/lib/workforce/business-card";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-500";
export default function BusinessCardEditor({ initial }: { initial: CardEditorData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState({ display_name: initial.name, job_title: initial.title, work_email: initial.profile?.work_email ?? "", work_phone: initial.profile?.work_phone ?? "", socials: initial.profile?.socials ?? {} });
  const [company, setCompany] = useState(initial.company);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState(""), [dirty, setDirty] = useState(false), [confirmRevoke, setConfirmRevoke] = useState(false);
  const [view, setView] = useState<"draft" | "published">(initial.profile?.published ? "published" : "draft");
  function field(key: "display_name" | "job_title" | "work_email" | "work_phone", value: string) { setDraft(p => ({ ...p, [key]: value })); setDirty(true); }
  async function command(action: string) {
    if (busy) return;
    setBusy(action); setError(""); setMessage("");
    try {
      const res = await fetch("/api/workforce/business-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: action, version: action === "company" ? data.company.version : data.profile?.version ?? 0, data: action === "company" ? company : action === "save" ? draft : {} }) });
      const next = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          const current = await fetch("/api/workforce/business-card", { cache: "no-store" });
          if (current.ok) { setData(await current.json()); if (action !== "company") setDirty(true); }
        }
        throw new Error(next.error || "تعذر إتمام العملية");
      }
      setData(next); setCompany(next.company);
      if (action === "save") { setDirty(false); setView("draft"); }
      if (action === "issue") setView("published");
      if (action === "revoke") { setView("draft"); setConfirmRevoke(false); }
      setMessage(action === "save" ? "تم حفظ البيانات" : action === "issue" ? "تم إصدار بطاقة العمل" : action === "company" ? "تم حفظ بيانات الشركة" : "أُلغيت البطاقة وتوقف رابطها السابق");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر الاتصال؛ أعد المحاولة"); }
    finally { setBusy(""); }
  }
  const profile = data.profile;
  const imageUrl = (side: string) => `/api/workforce/business-card/download?format=png&preview=true&side=${side}&draft=${view === "draft"}&v=${profile?.version ?? 0}&c=${data.company.version}`;
  return <section dir="rtl" className="mx-auto w-full max-w-screen-xl px-4 py-7 md:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black text-dark">بطاقة العمل</h1><span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">{profile?.published ? "صادرة" : "مسودة"}</span></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">{message}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={e => { e.preventDefault(); void command("save"); }} className="rounded-2xl border border-border bg-white p-5 md:p-6">
        <h2 className="mb-5 text-lg font-bold text-dark">بيانات البطاقة</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-bold">الاسم</span><input value={draft.display_name} onChange={e => field("display_name", e.target.value)} disabled={!data.admin || !!busy} required maxLength={70} className={inputClass} /></label>
          <label><span className="mb-2 block text-sm font-bold">المسمى الوظيفي</span><input value={draft.job_title} onChange={e => field("job_title", e.target.value)} disabled={!data.admin || !!busy} required maxLength={80} className={inputClass} /></label>
          <label><span className="mb-2 block text-sm font-bold">بريد العمل على البطاقة</span><input type="email" dir="ltr" value={draft.work_email} onChange={e => field("work_email", e.target.value)} maxLength={120} disabled={!!busy} className={inputClass} /></label>
          <label><span className="mb-2 block text-sm font-bold">رقم العمل على البطاقة</span><input type="tel" dir="ltr" value={draft.work_phone} onChange={e => field("work_phone", e.target.value)} maxLength={30} disabled={!!busy} className={inputClass} /></label>
        </div>
        <h2 className="mb-4 mt-7 text-lg font-bold text-dark">روابط التواصل</h2>
        <div className="grid gap-4 sm:grid-cols-2">{socialPlatforms.map(p => <label key={p.key}><span className="mb-2 block text-sm font-bold">{p.label}</span><input type="url" dir="ltr" value={draft.socials[p.key] ?? ""} onChange={e => { setDraft(d => ({ ...d, socials: { ...d.socials, [p.key]: e.target.value } })); setDirty(true); }} placeholder="https://" maxLength={500} disabled={!!busy} className={inputClass} /></label>)}</div>
        <p className="mt-5 text-sm text-slate-500">بيانات البطاقة وروابطها متاحة لمن يمسح الرمز بعد الإصدار.</p>
        <div className="mt-5 flex flex-wrap gap-3"><Button type="submit" loading={busy === "save"} disabled={!!busy}>حفظ البيانات ومعاينة</Button><Button type="button" variant="secondary" loading={busy === "issue"} disabled={!!busy || dirty || !profile || !Object.values(profile.socials).some(Boolean)} onClick={() => void command("issue")}>{profile?.published ? "تحديث البطاقة المنشورة" : "إصدار البطاقة"}</Button></div>
      </form>
      <div className="space-y-5 lg:sticky lg:top-28">
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold text-dark">{view === "draft" ? "معاينة البيانات المحفوظة" : "البطاقة الصادرة"}</h2>{profile?.published && <div className="flex gap-1 rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => setView("published")} className={`rounded-md px-3 py-2 text-xs font-bold ${view === "published" ? "bg-white shadow-sm" : ""}`}>الصادرة</button><button type="button" onClick={() => setView("draft")} className={`rounded-md px-3 py-2 text-xs font-bold ${view === "draft" ? "bg-white shadow-sm" : ""}`}>المسودة</button></div>}</div>
          {profile ? <div className="space-y-4">{["front", "back"].map(side => <figure key={`${side}-${profile.version}-${data.company.version}-${view}`}><img src={imageUrl(side)} alt={side === "front" ? "وجه بطاقة العمل: الاسم والمسمى وبيانات التواصل" : "ظهر بطاقة العمل: رمز التواصل وبيانات الشركة"} width={1004} height={650} className="w-full rounded-xl border shadow-sm" /><figcaption className="mt-2 text-center text-xs text-slate-500">{side === "front" ? "الوجه الأمامي" : "الوجه الخلفي"}</figcaption></figure>)}</div> : <div className="rounded-xl bg-[#102b57] px-6 py-12 text-center"><img src="/logo.png" alt="تواصل النخبة" className="mx-auto mb-6 h-28 w-auto rounded-xl bg-white p-3" /><p className="text-xl font-bold text-white">{draft.display_name || "بطاقة العمل"}</p><p className="mt-2 text-[#e2c47b]">{draft.job_title}</p></div>}
          {dirty && <p className="mt-3 text-sm text-amber-800">احفظ التعديلات لعرضها في المعاينة.</p>}
          {profile?.published && <><div className="mt-5 flex flex-wrap gap-2"><a href="/api/workforce/business-card/download?format=pdf" className="rounded-xl bg-[#102b57] px-4 py-3 text-sm font-bold text-white">تنزيل PDF · وجهان</a>{["front", "back"].map(side => <a key={side} href={`/api/workforce/business-card/download?format=png&side=${side}`} className="rounded-xl border px-3 py-3 text-sm font-bold">PNG · {side === "front" ? "أمامي" : "خلفي"}</a>)}</div><a href={cardPublicUrl(profile.slug)} target="_blank" rel="noopener noreferrer" className="mt-4 block text-sm font-bold text-dark underline">فتح صفحة روابط التواصل ↗</a><p className="mt-2 text-xs text-slate-500">85 × 55 مم · تاريخ الإصدار {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory" }).format(new Date(profile.issued_at!))}</p>
            <div className="mt-5 border-t pt-4">{confirmRevoke ? <div><p className="mb-3 text-sm">إلغاء البطاقة يوقف رمزها ورابطها السابقين.</p><div className="flex gap-3"><Button type="button" variant="outline" disabled={!!busy} onClick={() => void command("revoke")}>تأكيد الإلغاء</Button><button type="button" onClick={() => setConfirmRevoke(false)} disabled={!!busy} className="text-sm">رجوع</button></div></div> : <button type="button" disabled={!!busy} onClick={() => setConfirmRevoke(true)} className="text-sm font-bold text-red-700">إلغاء البطاقة المنشورة</button>}</div>
          </>}
        </div>
      </div>
    </div>
    {data.admin && <details className="mt-6 rounded-2xl border border-border bg-white p-6"><summary className="cursor-pointer font-bold text-dark">بيانات الشركة على بطاقات العمل</summary><form onSubmit={e => { e.preventDefault(); void command("company"); }} className="mt-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[{ key: "name", label: "اسم الشركة", max: 70 }, { key: "tagline", label: "العبارة التعريفية", max: 100 }, { key: "website", label: "موقع الشركة", max: 200 }, { key: "email", label: "بريد الشركة", max: 120 }, { key: "phone", label: "هاتف الشركة", max: 30 }, { key: "address", label: "عنوان الشركة", max: 150 }].map(f => <label key={f.key}><span className="mb-2 block text-sm font-bold">{f.label}</span><input value={company[f.key as keyof typeof company]} onChange={e => setCompany(c => ({ ...c, [f.key]: e.target.value }))} disabled={!!busy} required={f.key === "name" || f.key === "website"} maxLength={f.max} type={f.key === "email" ? "email" : f.key === "website" ? "url" : "text"} className={inputClass} /></label>)}</div><Button type="submit" disabled={!!busy} className="mt-4">حفظ بيانات الشركة</Button></form></details>}
  </section>;
}
