"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

export default function AccountSettings({ name, email, cardHref }: { name: string; email: string; cardHref: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [needsNonce, setNeedsNonce] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form);
    setMessage(""); setError("");
    if (values.get("newPassword") !== values.get("confirmPassword")) { setError("كلمتا المرور غير متطابقتين"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/workforce/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: values.get("currentPassword"), newPassword: values.get("newPassword"), ...(needsNonce ? { nonce: values.get("nonce") } : {}) }) });
      const data = await res.json();
      if (!res.ok) { if (data.needsNonce) setNeedsNonce(true); throw new Error(data.error || "تعذر تغيير كلمة المرور"); }
      form.reset(); setNeedsNonce(false); setMessage("تم تغيير كلمة المرور بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر الاتصال؛ أعد المحاولة"); }
    finally { setBusy(false); }
  }
  return <section dir="rtl" className="mx-auto w-full max-w-4xl px-4 py-7 md:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black text-dark">حسابي</h1><Link href={cardHref} className="rounded-xl border bg-white px-4 py-3 font-bold text-dark">بطاقة العمل ↗</Link></div>
    <div className="mb-6 rounded-2xl border border-border bg-white p-6"><p className="text-lg font-bold text-dark">{name || "مدير الشركة"}</p><p dir="ltr" className="mt-2 break-all text-right text-slate-600">{email}</p></div>
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white p-6">
      <h2 className="mb-5 text-lg font-bold text-dark">تغيير كلمة المرور</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-bold">كلمة المرور الحالية</span><input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} className="w-full rounded-xl border p-3" dir="ltr" /></label>
        <label className="block"><span className="mb-2 block text-sm font-bold">كلمة المرور الجديدة</span><input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} placeholder="12 حرفًا على الأقل" className="w-full rounded-xl border p-3" dir="ltr" /></label>
        <label className="block"><span className="mb-2 block text-sm font-bold">تأكيد كلمة المرور الجديدة</span><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} className="w-full rounded-xl border p-3" dir="ltr" /></label>
        {needsNonce && <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-bold">رمز التأكيد من البريد</span><input name="nonce" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" required className="w-full rounded-xl border p-3" dir="ltr" /></label>}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-green-700">{message}</p>}
      <Button type="submit" loading={busy} className="mt-5">حفظ كلمة المرور</Button>
    </form>
  </section>;
}
