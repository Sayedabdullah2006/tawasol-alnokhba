"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hasUnsavedWorkforceChanges } from "./shared";

export default function DashboardLiveStatus({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || hasUnsavedWorkforceChanges() || document.querySelector('dialog[open],[role="dialog"]')) return;
      if (admin) window.dispatchEvent(new Event("workforce-dashboard-tick"));
      else startTransition(() => router.refresh());
    };
    const stamp = () => setUpdated(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }));
    window.addEventListener("workforce-data-changed", stamp);
    const timer = window.setInterval(refresh, 45000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("workforce-data-changed", stamp); };
  }, [admin, router]);
  return <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800" title={updated ? `آخر تغيير ${updated}` : "تحديث كل 45 ثانية"}><span aria-hidden className={`h-2 w-2 rounded-full bg-emerald-500 ${pending ? "animate-pulse motion-reduce:animate-none" : ""}`} />{pending ? "جارٍ التحديث" : "تحديث تلقائي"}</span>;
}
