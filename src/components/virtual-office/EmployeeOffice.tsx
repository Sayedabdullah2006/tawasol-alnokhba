"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmployeeOfficeSnapshot } from "@/lib/virtual-office/employee-server";
import type {
  AgentId,
  OfficePersonId,
  OfficeStaff,
} from "@/lib/virtual-office/domain";
import {
  OFFICE_DEPARTMENTS,
  departmentById,
  departmentAgent,
  type DepartmentId,
} from "@/lib/virtual-office/departments";
import { firstName } from "@/lib/virtual-office/presentation";
import PresenceBadge, { PresenceClock } from "./OfficePresence";
import s from "./office.module.css";
import { useOfficeCoordination } from "./useOfficeCoordination";
import OfficeCoordinationPanel from "./OfficeCoordinationPanel";
const OfficeScene = dynamic(() => import("./OfficeScene"), {
  ssr: false,
  loading: () => <p className={s.sceneLoading}>جارٍ تجهيز مكتبك…</p>,
});
const endpoint = "/api/workforce/virtual-office";
const CompanyScene = dynamic(() => import("./CompanyScene"), {
  ssr: false,
  loading: () => <p className={s.sceneLoading}>جارٍ تجهيز إدارات الشركة…</p>,
});
export default function EmployeeOffice({
  initial,
  department,
  initialOverview = true,
}: {
  initial: EmployeeOfficeSnapshot;
  department: DepartmentId;
  initialOverview?: boolean;
}) {
  const router = useRouter();
  const [companyView, setCompanyView] = useState(initialOverview);
  const coordination = useOfficeCoordination(department);
  const [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [choice, setChoice] = useState<"available" | "busy">(
      initial.manualState,
    ),
    [saving, setSaving] = useState(false);
  const scoped = data.staff.filter((p) => p.officeDepartment === department);
  const [selected, setSelected] = useState<OfficePersonId>(() => {
    const own = scoped.find((p) => p.id === initial.employeeId) || scoped[0];
    return own ? `staff:${own.id}` : "editor";
  });
  const dialog = useRef<HTMLDialogElement>(null),
    revision = useRef(0),
    busy = useRef(false),
    mutating = useRef(false);
  const titleId = useId(),
    availabilityId = useId();
  const unit = departmentById(department),
    own = data.staff.find((p) => p.id === data.employeeId)!;
  const person = selected.startsWith("staff:")
    ? scoped.find((p) => `staff:${p.id}` === selected)
    : null;
  const virtual = !selected.startsWith("staff:")
    ? departmentAgent(department, selected as AgentId)
    : null;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (busy.current || mutating.current) return;
    busy.current = true;
    const version = ++revision.current;
    try {
      const r = await fetch(endpoint, { cache: "no-store", signal });
      const next = await r.json();
      if (!r.ok) throw Error(next.error || "تعذر تحديث المكتب");
      if (version === revision.current && !signal?.aborted) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "تعذر تحديث المكتب");
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const update = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    const timer = setInterval(update, 10000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    window.addEventListener("workforce-data-changed", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      window.removeEventListener("workforce-data-changed", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  const canSet =
    !!data.sessionId &&
    own.presence?.state !== "break" &&
    !["meeting", "confirmation"].includes(own.presence?.detail || "");
  async function saveAvailability() {
    if (mutating.current) return;
    mutating.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    ++revision.current;
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: choice, sessionId: data.sessionId }),
      });
      const next = await r.json();
      if (!r.ok) throw Error(next.error || "تعذر حفظ الحالة");
      setData(next);
      setNotice(
        choice === "busy"
          ? "تم، حالتك مشغول خلال جلسة الدوام الحالية."
          : "تم، حالتك متاح؛ الاجتماع والاستراحة والعمل الجاري تظهر تلقائيًا عند وجودها.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الحالة");
    } finally {
      mutating.current = false;
      setSaving(false);
    }
  }
  function openPerson(id: OfficePersonId) {
    setSelected(id);
    if (!dialog.current?.open) dialog.current?.showModal();
  }
  // Directory peers have no task metrics. The scene consumes appearance and identity only.
  const allStaff: OfficeStaff[] = data.staff.map((p) => ({
    ...p,
    metrics: { assigned: 0, open: 0, inProgress: 0, overdue: 0 },
  }));
  const staff = allStaff.filter((p) => p.officeDepartment === department);
  const summaries: Partial<Record<OfficePersonId, string>> = {};
  const ownTask = data.tasks.find((t) => t.stage === "in_progress");
  if (ownTask) summaries[`staff:${data.employeeId}`] = ownTask.title;
  return (
    <PresenceClock now={data.now}>
      <div dir="rtl" className={s.employeeOffice}>
        <div className={s.companyNavigation}>
          <div className={s.companyNavigationTitle}>
            <strong>مكتبي الافتراضي</strong>
            <span>فريق الشركة · مساحة عملك وصلاحياتك</span>
          </div>
          <nav aria-label="إدارات الشركة">
            {OFFICE_DEPARTMENTS.map((d) => (
              <Link
                key={d.id}
                scroll={false}
                href={`?department=${d.id}&view=department`}
                aria-current={department === d.id ? "page" : undefined}
              >
                {d.short}
              </Link>
            ))}
          </nav>
        </div>
        <div className={s.office}>
          <header className={s.header}>
            <div className={s.heading}>
              <div>
                <h1>{unit.name}</h1>
                <p>
                  أهلًا {firstName(own.name)}، هذا مكتبك مع فريق تواصل النخبة.
                </p>
              </div>
            </div>
            <div className={s.headerActions}>
              <Link className={s.primary} href="/employee/work/tasks">
                {data.canManageTasks ? "المهام وإدارة التكليفات" : "فتح مهامي"}
              </Link>
              <Link className={s.secondary} href="/employee/meetings">
                اجتماعاتي
              </Link>
            </div>
          </header>
          <section className={s.availabilityPanel} aria-label="حالتي في المكتب">
            <div>
              <strong>حالتي الآن</strong>
              <PresenceBadge presence={own.presence} />
              <p>
                الاتصال من الحضور المسجل. الاجتماع والاستراحة والعمل الجاري
                تتحدث تلقائيًا.
              </p>
            </div>
            <form
              action={endpoint}
              method="post"
              aria-labelledby={availabilityId}
              onSubmit={(e) => {
                e.preventDefault();
                void saveAvailability();
              }}
            >
              <fieldset disabled={!canSet || saving}>
                <legend id={availabilityId}>توفري أثناء الدوام</legend>
                <div className={s.availabilityOptions}>
                  {(["available", "busy"] as const).map((state) => (
                    <div key={state}>
                      <input
                        type="radio"
                        id={`${availabilityId}-${state}`}
                        name="state"
                        value={state}
                        checked={choice === state}
                        onChange={() => setChoice(state)}
                      />
                      <label htmlFor={`${availabilityId}-${state}`}>
                        {state === "available" ? "متاح" : "مشغول"}
                      </label>
                    </div>
                  ))}
                </div>
              </fieldset>
              <input
                type="hidden"
                name="sessionId"
                value={data.sessionId || ""}
              />
              <button
                type="submit"
                className={s.secondary}
                disabled={!canSet || saving}
              >
                {saving ? "جارٍ الحفظ…" : "حفظ حالتي"}
              </button>
            </form>
            <Link href="/employee/attendance/overview">
              الحضور والاستراحة ←
            </Link>
            <p className={s.notice} role="status">
              {notice}
            </p>
          </section>
          {error && (
            <p role="alert" className={s.error}>
              {error}
              <button type="button" onClick={() => void refresh()}>
                إعادة المحاولة
              </button>
            </p>
          )}
          <div className={s.topline}>
            <nav className={s.viewNav} aria-label="عرض المكتب">
              <button
                type="button"
                aria-pressed={companyView}
                onClick={() => setCompanyView(true)}
              >
                الشركة كاملة
              </button>
              <button
                type="button"
                aria-pressed={!companyView}
                onClick={() => setCompanyView(false)}
              >
                داخل الإدارة
              </button>
            </nav>
          </div>
          <div className={s.workplaceLayout}>
            <div>
              {companyView ? (
                <CompanyScene
                  motion={coordination.motion}
                  onMotionEnd={coordination.finish}
                  onOpenInteraction={coordination.open}
                  staff={allStaff}
                  department={department}
                  onEnter={(id) => {
                    setCompanyView(false);
                    router.push(`?department=${id}&view=department`, {
                      scroll: false,
                    });
                  }}
                />
              ) : (
                <OfficeScene
                  motion={coordination.motion}
                  onMotionEnd={coordination.finish}
                  onOpenInteraction={coordination.open}
                  employeeView
                  department={department}
                  selected={selected}
                  active={[]}
                  staff={staff}
                  activities={[]}
                  taskSummaries={summaries}
                  meeting={false}
                  meetingAgents={[]}
                  onSelect={setSelected}
                  onTalk={openPerson}
                  onOpenActivity={() => {}}
                />
              )}
            </div>
            <OfficeCoordinationPanel
              control={coordination}
              staff={allStaff}
              admin={false}
              onSession={() => {}}
            />
          </div>
          <section
            className={s.employeeWork}
            aria-labelledby={`${titleId}-tasks`}
          >
            <div>
              <h2 id={`${titleId}-tasks`}>أقرب مهامي</h2>
              <p>
                المهام المسندة لك أو التي تشارك فيها، ضمن صلاحيات نظام العمل.
              </p>
            </div>
            <ul className={s.humanTasks}>
              {data.tasks.map((task) => (
                <li key={task.id}>
                  <Link href={`/employee/work/tasks/${task.id}`}>
                    <strong>{task.title}</strong>
                    <span>
                      {task.stage === "in_progress"
                        ? "قيد التنفيذ"
                        : task.stage === "review"
                          ? "بانتظار المراجعة"
                          : "مفتوحة"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!data.tasks.length && <p>لا توجد مهام مفتوحة مسندة لك حاليًا.</p>}
            <div className={s.headerActions}>
              <Link className={s.secondary} href="/employee/work/projects">
                مشاريعي
              </Link>
              <Link className={s.secondary} href="/employee/profile">
                ملفي الوظيفي
              </Link>
              <Link className={s.secondary} href="/employee/requests/general">
                طلب إداري
              </Link>
            </div>
          </section>
          <section className={s.employeeWork} aria-label="فريق الإدارة">
            <h2>زملاء الإدارة</h2>
            <ul className={s.staffRoster}>
              {scoped.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openPerson(`staff:${p.id}`)}
                  >
                    <span className={s.employeeInitial} aria-hidden="true">
                      {p.name[0]}
                    </span>
                    <span>
                      <strong>
                        {firstName(p.name)}
                        {p.id === data.employeeId ? " · أنت" : ""}
                      </strong>
                      <small>{p.jobTitle}</small>
                      <PresenceBadge presence={p.presence} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!scoped.length && (
              <p>
                لا يوجد زملاء مسجلون بهذه الإدارة حاليًا؛ الشخصيات الظاهرة
                مساعدون افتراضيون.
              </p>
            )}
          </section>
          <dialog
            ref={dialog}
            className={s.chatDialog}
            aria-labelledby={titleId}
            {...{ closedby: "closerequest" }}
          >
            <div className={s.dialogBar}>
              <span>فريق تواصل النخبة</span>
              <form method="dialog">
                <button type="submit" autoFocus aria-label="إغلاق بطاقة الموظف">
                  ×
                </button>
              </form>
            </div>
            <div className={s.humanBody}>
              <h2 id={titleId}>
                {person
                  ? firstName(person.name)
                  : virtual?.firstName || "الموظف"}
              </h2>
              {person ? (
                <>
                  <p>{person.jobTitle}</p>
                  <PresenceBadge presence={person.presence} />
                  <p className={s.humanExplanation}>
                    {person.registeredDepartment}
                  </p>
                  {person.id === data.employeeId ? (
                    <Link className={s.primary} href="/employee/work/tasks">
                      فتح مهامي ومساحة عملي
                    </Link>
                  ) : (
                    <p className={s.humanExplanation}>
                      تظهر هنا هوية الزميل وحالة توفره. تجد أعمال الفريق المتاحة
                      لك في مساحة المهام.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <span className={s.humanBadge}>مساعد افتراضي</span>
                  <p>{virtual?.name}</p>
                  <p>{virtual?.responsibility}</p>
                  <p className={s.humanExplanation}>
                    تكليف المساعدين واعتماد خططهم من مساحة الإدارة.
                  </p>
                </>
              )}
            </div>
          </dialog>
        </div>
      </div>
    </PresenceClock>
  );
}
