import Link from "next/link";
import { journeySections } from "@/lib/workforce/journeys";

const tones = [
  "border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100",
  "border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100",
  "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 hover:bg-fuchsia-100",
  "border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100",
  "border-orange-200 bg-orange-50 text-orange-950 hover:bg-orange-100",
  "border-teal-200 bg-teal-50 text-teal-950 hover:bg-teal-100",
  "border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100",
  "border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100",
];

export default function DashboardJourneys({ admin = false }: { admin?: boolean }) {
  return (
    <nav aria-label={admin ? "إدارة شؤون الفريق" : "الأهداف وشؤون عملي"} className="space-y-3">
      <h2 className="text-lg font-black text-dark">{admin ? "شؤون الفريق" : "الأهداف وشؤون عملي"}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(journeySections).map(([key, section], index) => (
          <Link
            key={key}
            href={admin ? `/admin/workforce/people?section=${key}` : `/employee/${section.employee}`}
            className={`flex min-h-20 items-center justify-between gap-3 rounded-2xl border p-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-4 ${tones[index]}`}
          >
            <span>{section.title}</span><span aria-hidden="true">←</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
