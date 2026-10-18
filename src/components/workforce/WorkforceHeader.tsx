"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import NotificationBell from "./NotificationBell";
import WorkforceTestMode from "./WorkforceTestMode";

export default function WorkforceHeader({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const home = admin ? "/admin/workforce" : "/employee";

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fetch("/api/workforce/test-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      const { error: logoutError } = await createClient().auth.signOut();
      if (logoutError) throw logoutError;
      router.replace(`/auth/login?next=${home}`);
      router.refresh();
    } catch {
      setError("تعذر تسجيل الخروج. أعد المحاولة.");
      setBusy(false);
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-white/95 shadow-sm backdrop-blur">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:block focus:p-3"
      >
        تجاوز إلى المحتوى
      </a>
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Link
          href={home}
          className="flex items-center gap-3"
          aria-label={
            admin
              ? "إدارة فريق العمل — تواصل النخبة"
              : "بوابة الموظف — تواصل النخبة"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-11 w-auto object-contain" />
          <span>
            <span className="block text-sm font-black text-dark">
              تواصل النخبة
            </span>
            <span className="block text-xs text-muted">
              {admin ? "إدارة فريق العمل" : "بوابة الموظف"}
            </span>
          </span>
        </Link>
        <nav
          aria-label={admin ? "تنقل إدارة الفريق" : "تنقل الموظف"}
          className="flex items-center gap-2"
        >
          <WorkforceTestMode admin={admin} compact />
          <NotificationBell admin={admin} />
          <Link
            href={
              admin ? "/admin/workforce/profile" : "/employee/profile/account"
            }
            className="rounded-xl px-3 py-3 text-sm font-bold text-dark hover:bg-slate-100"
          >
            حسابي
          </Link>
          <Link
            href={admin ? "/admin" : "/employee"}
            className="rounded-xl px-3 py-3 text-sm font-bold text-dark hover:bg-slate-100"
          >
            {admin ? "إدارة العملاء" : "الرئيسية"}
          </Link>
          <Button size="sm" variant="outline" disabled={busy} onClick={logout}>
            {busy ? "جارٍ الخروج…" : "تسجيل الخروج"}
          </Button>
        </nav>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </header>
  );
}
