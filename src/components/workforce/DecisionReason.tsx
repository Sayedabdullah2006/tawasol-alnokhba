import { requestDate } from "./RequestMetadata";

export default function DecisionReason({ reason, decidedAt }: { reason: string; decidedAt?: string | null }) {
  return (
    <details className="request-decision group rounded-2xl border border-border bg-white/45 text-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 font-bold">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 group-open:rotate-180 motion-safe:transition-transform" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>سبب القرار</span>
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-4">
        {decidedAt && <p className="text-xs text-muted">تاريخ القرار: <time dateTime={decidedAt}>{requestDate(decidedAt)}</time></p>}
        <p className="whitespace-pre-wrap break-words leading-7">{reason}</p>
      </div>
    </details>
  );
}
