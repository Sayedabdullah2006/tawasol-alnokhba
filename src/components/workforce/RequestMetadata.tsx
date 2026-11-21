import type { ReactNode } from "react";

export const requestDate = (value: string) => new Date(value).toLocaleString("ar-SA", {
  calendar: "gregory",
  timeZone: "Asia/Riyadh",
  dateStyle: "medium",
  timeStyle: "short",
});

export function RequestField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-1"><dt className="text-xs text-muted">{label}</dt><dd className="break-words text-sm font-bold leading-7">{children}</dd></div>;
}

export default function RequestMetadata({ id, createdAt, children }: { id: string; createdAt: string; children?: ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl border border-border bg-white/45 p-4 sm:grid-cols-2">
      <RequestField label="رقم الطلب"><bdi title={id} aria-label={id} className="font-mono">#{id.slice(0, 8).toUpperCase()}</bdi></RequestField>
      <RequestField label="تاريخ الطلب"><time dateTime={createdAt}>{requestDate(createdAt)}</time></RequestField>
      {children}
    </dl>
  );
}
