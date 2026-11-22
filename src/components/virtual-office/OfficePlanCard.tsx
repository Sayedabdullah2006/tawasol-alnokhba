"use client";
import { useId, useState } from "react";
import { agentById, type OfficeSession } from "@/lib/virtual-office/domain";
import s from "./office.module.css";
export default function OfficePlanCard({
  session,
  pending,
  configured,
  onAction,
}: {
  session: OfficeSession;
  pending: boolean;
  configured: boolean;
  onAction: (action: string, notes?: string) => Promise<boolean>;
}) {
  const id = useId(),
    [notes, setNotes] = useState("");
  const plan = session.plan;
  if (!plan) return null;
  const reviewing = session.status === "plan_review";
  const content = (
    <>
      <p className={s.planSummary}>{plan.summary}</p>
      <ol className={s.planSteps}>
        {plan.steps.map((step, index) => {
          const agent = agentById(step.agentId);
          return (
            <li key={step.agentId}>
              <div>
                <span className={s.planNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <strong>{agent.firstName}</strong>
                <small>{agent.name}</small>
              </div>
              <p>{step.instruction}</p>
              <p>
                <b>التسليم:</b> {step.deliverable}
              </p>
              <small>سبب الاختيار: {step.reason}</small>
            </li>
          );
        })}
        <li className={s.planFinal}>
          <strong>عبدالله · مدير التحرير</strong>
          <p>
            {plan.steps.length
              ? "يجمع تسليمات التخصصات المختارة ويرفع النتيجة النهائية لاعتمادك."
              : "يتولى إنجاز الطلب بنفسه دون إسناد لتخصصات إضافية."}
          </p>
        </li>
      </ol>
      {plan.excluded.length > 0 && (
        <details className={s.excludedRoles}>
          <summary>
            تخصصات لا نحتاجها لهذا الطلب ({plan.excluded.length})
          </summary>
          <ul>
            {plan.excluded.map((ex) => {
              const a = agentById(ex.agentId);
              return (
                <li key={ex.agentId}>
                  <b>
                    {a.firstName} · {a.name}
                  </b>
                  <span>{ex.reason}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
  if (!reviewing)
    return (
      <details className={s.approvedPlan}>
        <summary>
          {session.approved_plan_version === session.plan_version
            ? "الخطة المعتمدة"
            : "الخطة المقترحة"}{" "}
          · {plan.steps.length} تخصصات مختارة
        </summary>
        {content}
      </details>
    );
  return (
    <section className={s.planCard}>
      <div className={s.planHeader}>
        <h3>خطة عبدالله للطلب</h3>
        <span>نسخة {session.plan_version}</span>
      </div>
      <p className={s.planNotice}>
        لم يبدأ الفريق التنفيذ بعد. راجع المشاركين والتسليمات، ثم وافق أو اطلب
        تعديل الخطة.
      </p>
      {content}
      <button
        type="button"
        className={s.primary}
        disabled={pending || !configured}
        onClick={() => void onAction("approve_plan")}
      >
        {pending ? "جارٍ الحفظ…" : "أوافق على الخطة، ابدأ التنفيذ"}
      </button>
      <details className={s.planRevision}>
        <summary>أريد تعديل الخطة</summary>
        <form
          method="post"
          action="/api/admin/virtual-office"
          aria-labelledby={`${id}-label`}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onAction("revise_plan", notes)) setNotes("");
          }}
        >
          <label id={`${id}-label`} htmlFor={`${id}-notes`}>
            التعديل المطلوب (مطلوب)
          </label>
          <textarea
            id={`${id}-notes`}
            name="notes"
            required
            minLength={3}
            maxLength={4000}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-describedby={`${id}-help`}
          />
          <p id={`${id}-help`}>
            من ٣ إلى ٤٠٠٠ حرف. مثلًا: نحتاج التصميم فقط، والنص معتمد.
          </p>
          <button
            type="submit"
            className={s.secondary}
            disabled={pending || !configured}
          >
            أعد إعداد الخطة
          </button>
        </form>
      </details>
    </section>
  );
}
