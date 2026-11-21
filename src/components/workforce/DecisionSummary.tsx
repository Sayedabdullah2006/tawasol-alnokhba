export default function DecisionSummary({
  employeeName,
  requestTitle,
  requestKind,
  reason,
  period,
  warning,
}: {
  employeeName: string;
  requestTitle: string;
  requestKind: string;
  reason: string;
  period?: string;
  warning?: string;
}) {
  return (
    <div className="space-y-4">
      <p>راجع القرار والسبب قبل التأكيد. سيُحفظ القرار وتُشعر به الموظفة.</p>
      <dl className="space-y-3 rounded-xl border border-border bg-slate-50 p-4">
        {[
          ["الموظفة", employeeName],
          ["نوع الطلب", requestKind],
          ["الطلب", requestTitle],
          ...(period ? [["الفترة", period]] : []),
          ["سبب القرار", reason],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="whitespace-pre-wrap break-words font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {warning && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">{warning}</p>}
    </div>
  );
}
