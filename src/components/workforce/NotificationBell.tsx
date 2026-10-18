"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./shared";
export default function NotificationBell({ admin }: { admin: boolean }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const update = () => {
      if (document.visibilityState === "visible")
        api<{ unread: number }>("/api/workforce/notifications?unread=true", {
          signal: abort.signal,
        })
          .then((result) => setCount(result.unread))
          .catch(() => setCount(null));
    };
    update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener("workforce-notifications", update);
    window.addEventListener("focus", update);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("workforce-notifications", update);
      window.removeEventListener("focus", update);
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
