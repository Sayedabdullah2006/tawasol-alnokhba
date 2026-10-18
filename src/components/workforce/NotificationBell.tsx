"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { api } from "./shared";
export default function NotificationBell({ admin }: { admin: boolean }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const abort = new AbortController(),
      db = createClient();
    let channel: RealtimeChannel | undefined,
      connecting = false;
    let changeTimer: number | undefined;
    const announce = () => {
      clearTimeout(changeTimer);
      changeTimer = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          update();
          window.dispatchEvent(new Event("workforce-data-changed"));
        }
      }, 250);
    };
    const update = () => {
      if (document.visibilityState === "visible")
        api<{ unread: number; recipientId: string }>(
          "/api/workforce/notifications?summary=true",
          {
            signal: abort.signal,
          },
        )
          .then(async (result) => {
            if (abort.signal.aborted) return;
            setCount(result.unread);
            if (!channel && !connecting && result.recipientId) {
              connecting = true;
              const { data } = await db.auth.getSession();
              if (!data.session || abort.signal.aborted) {
                connecting = false;
                return;
              }
              await db.realtime.setAuth(data.session.access_token);
              if (abort.signal.aborted) return;
              channel = db
                .channel(`workforce-notifications:${result.recipientId}`)
                .on(
                  "postgres_changes",
                  {
                    event: "*",
                    schema: "public",
                    table: "wf_notifications",
                    filter: `recipient_id=eq.${result.recipientId}`,
                  },
                  announce,
                )
                .on(
                  "postgres_changes",
                  { event: "*", schema: "public", table: "wf_tasks" },
                  announce,
                )
                .subscribe();
            }
          })
          .catch(() => setCount(null));
    };
    update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener("workforce-notifications", update);
    const focus = () => {
      update();
      window.dispatchEvent(new Event("workforce-data-changed"));
    };
    window.addEventListener("focus", focus);
    return () => {
      abort.abort();
      if (channel) void db.removeChannel(channel);
      clearInterval(timer);
      clearTimeout(changeTimer);
      window.removeEventListener("workforce-notifications", update);
      window.removeEventListener("focus", focus);
    };
  }, []);
  return (
    <Link
      href={
        admin
          ? "/admin/workforce/notifications"
          : "/employee/notifications/inbox"
      }
      className="rounded-xl px-3 py-3 text-sm font-bold hover:bg-slate-100"
      aria-label={`الإشعارات${count !== null ? `، ${count} غير مقروءة` : ""}`}
    >
      الإشعارات{" "}
      {count !== null && count > 0 && (
        <span className="mr-1 rounded-full bg-green px-2 py-1 text-xs text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
