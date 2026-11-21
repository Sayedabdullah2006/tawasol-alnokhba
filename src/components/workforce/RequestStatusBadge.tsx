import type { ReactNode } from "react";

export default function RequestStatusBadge({ status, children }: { status: string; children: ReactNode }) {
  const tone = status === "approved"
    ? "border-emerald-300 bg-emerald-100 text-emerald-900"
    : status === "rejected"
      ? "border-red-300 bg-red-100 text-red-900"
      : status === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-100 text-slate-700";
  return <span data-request-badge={status} className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>{children}</span>;
}
