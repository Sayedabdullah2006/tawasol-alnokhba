"use client";
import { controlClass } from "./shared";

// Three native selects avoid locale-dependent typing and remain usable without a pointer.
export default function DateInput({
  id,
  label,
  value,
  onChange,
  required = false,
  name,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  name?: string;
}) {
  const parts = value.split("-");
  const year = parts[0] || "";
  const month = parts[1] || "";
  const day = parts[2] || "";
  const any = !!(year || month || day);
  const update = (index: number, next: string) => {
    const current = [year, month, day];
    current[index] = next;
    onChange(current.some(Boolean) ? current.join("-") : "");
  };
  const monthNames = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  return (
    <fieldset id={id} className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-bold text-dark">{label}</legend>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="grid grid-cols-3 gap-2">
        <select
          aria-label={`يوم ${label}`}
          className={controlClass}
          value={day}
          onChange={(e) => update(2, e.target.value)}
          required={required || any}
        >
          <option value="">اليوم</option>
          {Array.from({ length: 31 }, (_, i) =>
            String(i + 1).padStart(2, "0"),
          ).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>
        <select
          aria-label={`شهر ${label}`}
          className={controlClass}
          value={month}
          onChange={(e) => update(1, e.target.value)}
          required={required || any}
        >
          <option value="">الشهر</option>
          {monthNames.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label={`سنة ${label}`}
          className={controlClass}
          value={year}
          onChange={(e) => update(0, e.target.value)}
          required={required || any}
        >
          <option value="">السنة</option>
          {Array.from({ length: 151 }, (_, i) => 1950 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {!required && any && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs font-bold text-green underline"
        >
          مسح {label}
        </button>
      )}
    </fieldset>
  );
}
