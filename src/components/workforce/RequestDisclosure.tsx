import type { ReactNode } from "react";

export default function RequestDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="request-decision group rounded-2xl border border-border bg-white/45 text-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 font-bold">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 group-open:rotate-180 motion-safe:transition-transform" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{title}</span>
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
