"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { workDate } from "@/lib/workforce/task-types";
import { api, Notice } from "./shared";
type Notification = {
  id: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};
type Result = { notifications: Notification[]; count: number; unread: number };
export default function NotificationCenter() {
  const [data, setData] = useState<Result | null>(null),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [unread, setUnread] = useState(false),
    [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  useEffect(() => {
    const refresh = () => {
      setRevision((n) => n + 1);
    };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    api<Result>(`/api/workforce/notifications?page=${page}&unread=${unread}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [page, unread, revision]);
  async function read(id?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await api("/api/workforce/notifications", {
        method: "POST",
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      setRevision((n) => n + 1);
      window.dispatchEvent(new Event("workforce-notifications"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <h1 className="text-3xl font-black">الإشعارات</h1>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              setPage(1);
            }}
          />
          غير المقروءة فقط
        </label>
        <span>{data?.unread ?? "…"} غير مقروء</span>
        <Button
          variant="outline"
          disabled={busy || !data?.unread}
          onClick={() => read()}
        >
          تعليم الكل كمقروء
        </Button>
        <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
          تحديث
        </Button>
      </div>
      <Notice message={error} error />
      {!data && !error && <p role="status">جارٍ تحميل الإشعارات…</p>}
      {data?.notifications.map((item) => (
        <article
          key={item.id}
          className={`space-y-3 rounded-2xl border p-5 ${item.read_at ? "border-border bg-white" : "border-green bg-green/5"}`}
        >
          <h2 className="font-bold">
            {!item.read_at && (
              <span className="ml-2 text-xs text-green">جديد</span>
            )}
            {item.title}
          </h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">
            {item.body}
          </p>
          <p className="text-xs text-muted">{workDate(item.created_at)}</p>
          <div className="flex flex-wrap gap-4">
            <Link
              href={item.href}
              className="py-2 font-bold text-green"
              onClick={() => {
                if (!item.read_at) void read(item.id);
              }}
            >
              فتح التفاصيل ←
            </Link>
            {!item.read_at && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => read(item.id)}
              >
                تمت القراءة
              </Button>
            )}
          </div>
        </article>
      ))}
      {data && !data.notifications.length && <p>لا توجد إشعارات مطابقة.</p>}
      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((n) => n - 1)}
        >
          السابق
        </Button>
        <span>{page}</span>
        <Button
          variant="outline"
          disabled={!data || page * 20 >= data.count}
          onClick={() => setPage((n) => n + 1)}
        >
          التالي
        </Button>
      </div>
    </section>
  );
}
