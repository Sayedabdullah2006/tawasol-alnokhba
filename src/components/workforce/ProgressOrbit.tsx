export default function ProgressOrbit({ value, label, detail, className = "text-sky-600" }: { value: number; label: string; detail?: string; className?: string }) {
  const amount = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
  return <div className={`relative flex h-28 w-28 shrink-0 items-center justify-center ${className}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amount}>
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="7" /><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${amount} 100`} className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none" /></svg>
    <span className="relative text-center"><strong className="block text-2xl font-black tabular-nums">{amount}%</strong><span className="mt-1 block text-[10px] font-bold">{detail || label}</span></span>
  </div>;
}
