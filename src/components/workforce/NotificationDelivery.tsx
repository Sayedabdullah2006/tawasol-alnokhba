"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Notice } from "./shared";
import { workDate } from "@/lib/workforce/task-types";

type DeliveryStatus = {
  settings: { enabled: boolean; last_run_at: string | null };
  counts: Record<string, number>;
  recent: {
    id: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    notification: { title: string } | null;
  }[];
};
const labels: Record<string, string> = {
  pending: "في الانتظار",
  processing: "جارٍ الإرسال",
  sent: "قبله مزود البريد",
  failed: "تعذر الإرسال",
  cancelled: "ألغي",
};
export default function NotificationDelivery() {
  const [data, setData] = useState<DeliveryStatus | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let active = false;
    const load = async () => {
      if (active || document.visibilityState !== "visible") return;
      active = true;
      try {
        setData(
          await api<DeliveryStatus>("/api/workforce/notification-delivery", {
            signal: abort.signal,
          }),
        );
        setError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        active = false;
      }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("workforce-data-changed", load);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("workforce-data-changed", load);
    };
  }, []);
  return (
    <section
      className="mx-auto mt-5 max-w-4xl space-y-4 rounded-2xl border border-border bg-white p-5"
      aria-labelledby="delivery-status"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h2 id="delivery-status" className="text-lg font-black">
          إرسال الإشعارات بالبريد
        </h2>
        <Link
          href="/api/workforce/notification-delivery/preview"
          target="_blank"
          className="text-sm font-bold text-green"
        >
          معاينة رسالة البريد ←
        </Link>
      </div>
      <Notice message={error} error />
      {data && (
        <>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              {data.settings.enabled ? "الإرسال مفعّل" : "الإرسال متوقف"}
            </span>
            <span>آخر فحص: {workDate(data.settings.last_run_at)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(data.counts).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-muted">{labels[key]}</p>
                <p className="mt-2 text-xl font-black">{value}</p>
              </div>
            ))}
          </div>
          {data.recent.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                آخر الرسائل
              </summary>
              <div className="mt-3 divide-y divide-border">
                {data.recent.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                  >
                    <span>{row.notification?.title || "إشعار وظيفي"}</span>
                    <span
                      className={
                        row.status === "failed" ? "text-red-700" : "text-muted"
                      }
                    >
                      {labels[row.status]}
                      {row.status === "failed" && row.last_error
                        ? ` · ${row.last_error}`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
