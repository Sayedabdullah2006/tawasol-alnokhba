"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { OfficeStaff, StaffAppearance } from "@/lib/virtual-office/domain";
import s from "./office.module.css";
import PresenceBadge from "./OfficePresence";
type Task = { id: string; title: string; dueAt: string | null; stage: string };
const stageNames: Record<string, string> = {
  backlog: "لم تبدأ",
  todo: "لم تبدأ",
  in_progress: "قيد التنفيذ",
  review: "بانتظار المراجعة",
  done: "مكتملة",
};
export default function HumanStaffPanel({
  person,
  portrait,
  onSaved,
}: {
  person: OfficeStaff;
  portrait: ReactNode;
  onSaved: () => Promise<void>;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [preset, setPreset] = useState<StaffAppearance>(person.appearance),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch(
          `/api/admin/virtual-office?employee=${encodeURIComponent(person.id)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setTasks(d.tasks);
        setError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "تعذر تحميل المهام");
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [person.id]);
  async function save() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const r = await fetch("/api/admin/virtual-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "staffAppearance",
          employeeId: person.id,
          preset,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await onSaved();
      setNotice("حُفظ مظهر الشخصية في المكتب.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ المظهر");
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside
      className={s.workPanel}
      aria-label={`مساحة الموظف الحقيقي ${person.name}`}
    >
      <div className={s.agentHeader}>
        {portrait}
        <div>
          <span className={s.humanBadge}>الفريق الحقيقي</span>
          <h2>{person.name}</h2>
          <p>{person.jobTitle || "عضو في فريق تواصل النخبة"}</p>
          <PresenceBadge presence={person.presence} />
        </div>
      </div>
      <div className={s.humanBody}>
        <p className={s.humanExplanation}>
          الحالة من جلسة الحضور المسجلة في النظام، وتوضح الاجتماع أو الاستراحة
          أو العمل الجاري. حركة الشخصية تمثيلية ولا تغير الحضور.
        </p>
        <dl className={s.humanMetrics}>
          <div>
            <dt>مهام مفتوحة</dt>
            <dd>{person.metrics.open}</dd>
          </div>
          <div>
            <dt>قيد التنفيذ</dt>
            <dd>{person.metrics.inProgress}</dd>
          </div>
          <div>
            <dt>متأخرة</dt>
            <dd>{person.metrics.overdue}</dd>
          </div>
        </dl>
        <p className={s.humanExplanation}>
          {person.registeredDepartment &&
            `القسم المسجل: ${person.registeredDepartment}. `}
          {person.departmentReason}
        </p>
        <h3>أقرب مهام العمل</h3>
        {error && (
          <p role="alert" className={s.humanError}>
            {error}
          </p>
        )}
        {tasks === null ? (
          <p className={s.humanExplanation}>جارٍ تحميل المهام…</p>
        ) : !tasks.length ? (
          <p className={s.humanExplanation}>لا توجد مهام مفتوحة حاليًا.</p>
        ) : (
          <ul className={s.humanTasks}>
            {tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/workforce/tasks/${t.id}`}>
                  <strong>{t.title}</strong>
                  <span>
                    {stageNames[t.stage] || "مفتوحة"}
                    {t.dueAt &&
                      ` · ${new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" }).format(new Date(t.dueAt))}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          className={s.humanProfileLink}
          href={`/admin/workforce/employees/${person.id}`}
        >
          فتح ملف الموظف
        </Link>
        <div className={s.appearanceForm}>
          <h3>مظهر الشخصية</h3>
          <p>
            اختر تمثيل الشخصية بنفسك. لا نستخدم صورة شخصية ولا نفترض المظهر من
            الاسم.
          </p>
          <label htmlFor="human-appearance">اللباس والتسريحة</label>
          <select
            id="human-appearance"
            value={preset}
            onChange={(e) => setPreset(e.target.value as StaffAppearance)}
          >
            <option value="unset">مظهر محايد، لم يحدد بعد</option>
            <option value="shemagh">شاب بالشماغ والعقال</option>
            <option value="hijab">بنت بالحجاب</option>
            <option value="hair">بنت بدون حجاب</option>
          </select>
          <button
            className={s.primary}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "جارٍ الحفظ…" : "حفظ مظهر الشخصية"}
          </button>
          <p className={s.notice} role="status">
            {notice}
          </p>
        </div>
      </div>
    </aside>
  );
}
