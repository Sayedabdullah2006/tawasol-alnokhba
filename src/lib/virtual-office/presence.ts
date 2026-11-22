export type OfficePresence = {
  online: boolean;
  state: "available" | "busy" | "break" | "offline";
  detail:
    "attendance" | "meeting" | "task" | "manual" | "confirmation" | "break";
  observedAt: string;
};
export const AVAILABILITY_LABELS = {
  available: "متاح",
  busy: "مشغول",
} as const;
/** A failed poll must never leave a green online dot displayed indefinitely. */
export function presenceView(presence?: OfficePresence, now = Date.now()) {
  if (
    !presence ||
    !Number.isFinite(Date.parse(presence.observedAt)) ||
    now - Date.parse(presence.observedAt) > 45000
  )
    return {
      state: "unknown",
      label: "الحالة غير محدثة",
      online: false,
      detail: "جارٍ التحقق من الحضور",
    };
  const detail =
    presence.detail === "meeting"
      ? "في اجتماع"
      : presence.detail === "task"
        ? "يعمل على مهمة"
        : presence.detail === "confirmation"
          ? "بانتظار تأكيد الاستمرار"
          : "";
  const label =
    presence.state === "offline"
      ? "أوفلاين · خارج الدوام"
      : presence.state === "break"
        ? "أونلاين · في استراحة"
        : `أونلاين · ${AVAILABILITY_LABELS[presence.state]}${detail ? ` · ${detail}` : ""}`;
  return { state: presence.state, label, online: presence.online, detail };
}
