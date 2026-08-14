"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  formatMembershipNumber,
  membershipBenefitLabel,
  membershipStatusLabel,
} from "@/lib/memberships";
import {
  formatMembershipTopupNumber,
  getMembershipTopupItem,
} from "@/lib/membership-topups";
import { formatNumber } from "@/lib/utils";
import MembershipPlanBadge from "@/components/memberships/MembershipPlanBadge";

type MembershipSummary = {
  id: string;
  status: string;
  membership_number: string | number;
  plan_id?: string | null;
  ends_at?: string | null;
  membership_plans?: { id?: string; name_ar?: string | null } | null;
};

type BenefitWallet = {
  id: string;
  benefit_type: Parameters<typeof membershipBenefitLabel>[0];
  total_units: number;
  reserved_units: number;
  used_units: number;
  unit_budget: number;
};

type Deliverable = {
  id: string;
  title: string;
  status: string;
  period_start?: string | null;
  period_end?: string | null;
  due_at?: string | null;
  file_url?: string | null;
};

type MembershipTopup = {
  id: string;
  item_type: string;
  quantity: number;
  topup_number: string | number;
  total_amount: number;
  status: string;
  created_at: string;
};

type CreditLedgerEntry = {
  id: string;
  note?: string | null;
  transaction_type: string;
  credits: number;
  created_at: string;
};

type MembershipDetail = {
  membership?: MembershipSummary;
  wallet?: { total_credits: number; reserved_credits: number; used_credits: number } | null;
  benefitWallets: BenefitWallet[];
  deliverables: Deliverable[];
  topups: MembershipTopup[];
  ledger: CreditLedgerEntry[];
};

export default function MembershipDashboardPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [detail, setDetail] = useState<MembershipDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/memberships").then(async (response) => {
      if (response.status === 401) {
        router.replace("/auth/login?next=/dashboard/membership");
        return;
      }
      const data = await response.json().catch(() => ({}));
      const list: MembershipSummary[] = Array.isArray(data.memberships)
        ? data.memberships
        : [];
      setMemberships(list);
      const current =
        list.find((item) => item.status === "active") ?? list[0];
      if (current) {
        const details = await fetch(`/api/memberships/${current.id}`).then(
          (res) => res.json(),
        );
        setDetail(details);
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) return <LoadingSpinner size="lg" />;
  const membership = detail?.membership ?? memberships[0];

  if (!membership)
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <div className="rounded-lg border border-border bg-card p-8">
          <h1 className="text-2xl font-black text-dark">لا توجد عضوية بعد</h1>
          <p className="mt-2 text-sm text-muted">
            يمكنك الاستمرار بالطلبات المباشرة أو اختيار عضوية تمنحك رصيداً مرناً
            طوال مدتها.
          </p>
          <Button onClick={() => router.push("/request")} className="mt-5">
            استكشف العضويات
          </Button>
        </div>
      </div>
    );

  const wallet = detail?.wallet;
  const benefitWallets = detail?.benefitWallets ?? [];
  const deliverables = detail?.deliverables ?? [];
  const topups = detail?.topups ?? [];
  const ledger = detail?.ledger ?? [];
  const totalCredits = wallet?.total_credits ?? 0;
  const available = wallet
    ? totalCredits - wallet.reserved_credits - wallet.used_credits
    : 0;
  const number = formatMembershipNumber(membership.membership_number);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5" dir="rtl">
      <section className="overflow-hidden rounded-lg border border-border bg-dark text-white shadow-lg">
        <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-4">
            <MembershipPlanBadge
              planId={membership.plan_id ?? membership.membership_plans?.id}
              planName={membership.membership_plans?.name_ar}
              size="lg"
            />
            <div>
              <p className="text-xs font-bold text-gold">{number}</p>
              <h1 className="mt-1 text-2xl font-black">
                {membership.membership_plans?.name_ar}
              </h1>
              <p className="mt-2 text-sm text-white/60">
                {membershipStatusLabel(membership.status)} · حتى{" "}
                {membership.ends_at
                  ? new Date(membership.ends_at).toLocaleDateString("ar-SA")
                  : "بانتظار التفعيل"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/api/memberships/${membership.id}/contract`}
              className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold hover:bg-white/10"
            >
              تحميل العقد PDF
            </Link>
            {membership.status === "pending_payment" && (
              <Button
                onClick={() =>
                  router.push(`/memberships/payment/${membership.id}`)
                }
                className="!bg-gold !text-dark"
              >
                إكمال الدفع
              </Button>
            )}
          </div>
        </div>
      </section>
      {membership.status === "active" && (
        <>
          <div
            id="membership-balance"
            className="grid scroll-mt-28 gap-4 sm:grid-cols-3"
          >
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs text-muted">الرصيد المتاح</p>
              <p className="mt-2 text-3xl font-black text-green">{available}</p>
              <p className="mt-1 text-xs text-muted">
                من أصل {totalCredits} طوال مدة العضوية
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs text-muted">المحجوز</p>
              <p className="mt-2 text-3xl font-black text-gold">
                {wallet?.reserved_credits ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted">
                لطلبات تنتظر بدء التنفيذ
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs text-muted">المستخدم</p>
              <p className="mt-2 text-3xl font-black text-dark">
                {wallet?.used_credits ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted">منذ تفعيل العضوية</p>
            </div>
          </div>
          {benefitWallets.length > 0 && (
            <section
              id="membership-benefits"
              className="scroll-mt-28 rounded-lg border border-border bg-card p-5"
            >
              <h2 className="font-black text-dark">مزايا العضوية المتاحة</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {benefitWallets.map((item) => (
                  <div key={item.id} className="rounded-lg bg-cream p-4">
                    <p className="text-xs text-muted">
                      {membershipBenefitLabel(item.benefit_type)}
                    </p>
                    <p className="mt-1 text-2xl font-black text-dark">
                      {item.total_units - item.reserved_units - item.used_units}
                    </p>
                    <p className="text-[11px] text-muted">
                      متبقية من {item.total_units}
                      {item.unit_budget > 0
                        ? ` · حتى ${item.unit_budget} ر.س للحملة`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {deliverables.length > 0 && (
            <section
              id="membership-plan"
              className="scroll-mt-28 rounded-lg border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-dark">خطتك ومخرجات العضوية</h2>
                  <p className="text-xs text-muted">
                    متابعة خطة التسويق والمخرجات الدورية المتفق عليها.
                  </p>
                </div>
                <span className="text-xs font-bold text-green">
                  {
                    deliverables.filter(
                      (item) => item.status === "completed",
                    ).length
                  }{" "}
                  من {deliverables.length} مكتمل
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {deliverables.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-dark">{item.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {item.period_start && item.period_end
                            ? `${new Date(item.period_start).toLocaleDateString("ar-SA")} - ${new Date(item.period_end).toLocaleDateString("ar-SA")}`
                            : item.due_at
                              ? `الموعد المتوقع ${new Date(item.due_at).toLocaleDateString("ar-SA")}`
                              : ""}
                        </p>
                      </div>
                      <span
                        className={
                          item.status === "completed"
                            ? "rounded-full bg-green px-2.5 py-1 text-[10px] font-bold text-white"
                            : item.status === "in_progress"
                              ? "rounded-full bg-gold/20 px-2.5 py-1 text-[10px] font-bold text-dark"
                              : "rounded-full bg-cream px-2.5 py-1 text-[10px] font-bold text-muted"
                        }
                      >
                        {item.status === "completed"
                          ? "مكتمل"
                          : item.status === "in_progress"
                            ? "قيد الإعداد"
                            : "قادم"}
                      </span>
                    </div>
                    {item.file_url && (
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-xs font-bold text-green hover:underline"
                      >
                        فتح الملف
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/10 p-5">
              <div>
                <h2 className="font-black text-dark">لديك إنجاز جديد؟</h2>
                <p className="text-xs text-muted">
                  استخدم رصيدك دون المرور بمرحلة الدفع.
                </p>
              </div>
              <Button
                onClick={() =>
                  router.push(
                    `/dashboard/membership/request?membership=${membership.id}`,
                  )
                }
              >
                طلب من رصيد العضوية
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green/25 bg-green/5 p-5">
              <div>
                <h2 className="font-black text-dark">
                  تحتاج رصيداً أو ميزة إضافية؟
                </h2>
                <p className="text-xs text-muted">
                  اختر الكمية وراجع السعر قبل الدفع.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard/membership/topup")}
              >
                تعزيز رصيد العضوية
              </Button>
            </div>
          </div>
          {topups.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-dark">عمليات تعزيز الرصيد</h2>
                  <p className="text-xs text-muted">
                    سجل عمليات شراء الرصيد والمزايا الإضافية.
                  </p>
                </div>
                <Link
                  href="/dashboard/membership/topup"
                  className="text-xs font-bold text-green hover:underline"
                >
                  عملية جديدة
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                {topups.map((topup) => {
                  const item = getMembershipTopupItem(topup.item_type);
                  return (
                    <div
                      key={topup.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-dark">
                          {topup.quantity} ×{" "}
                          {item?.shortLabel ?? topup.item_type}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatMembershipTopupNumber(topup.topup_number)} ·{" "}
                          {new Date(topup.created_at).toLocaleDateString(
                            "ar-SA",
                          )}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-dark">
                          {formatNumber(Number(topup.total_amount))} ر.س
                        </p>
                        <span
                          className={
                            topup.status === "paid"
                              ? "text-xs font-bold text-green"
                              : topup.status === "pending_payment"
                                ? "text-xs font-bold text-gold"
                                : "text-xs font-bold text-red-600"
                          }
                        >
                          {topup.status === "paid"
                            ? "مكتملة"
                            : topup.status === "pending_payment"
                              ? "بانتظار الدفع"
                              : "غير مكتملة"}
                        </span>
                      </div>
                      {topup.status === "pending_payment" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            router.push(
                              `/memberships/topup/payment/${topup.id}`,
                            )
                          }
                        >
                          إكمال الدفع
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
      <section
        id="membership-ledger"
        className="scroll-mt-28 rounded-lg border border-border bg-card p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-dark">سجل الرصيد</h2>
          <span className="text-xs text-muted">
            {detail?.ledger?.length ?? 0} حركة
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {ledger.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted">
              لا توجد حركات رصيد بعد.
            </p>
          ) : (
            ledger.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-bold text-dark">
                    {item.note ?? item.transaction_type}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(item.created_at).toLocaleString("ar-SA")}
                  </p>
                </div>
                <span
                  className={
                    item.credits > 0
                      ? "font-black text-green"
                      : "font-black text-red-600"
                  }
                >
                  {item.credits > 0 ? "+" : ""}
                  {item.credits}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
