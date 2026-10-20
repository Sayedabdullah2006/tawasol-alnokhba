type DeliveryState = {
  frozen: boolean;
  kind: string;
  canWork: boolean;
  canReview: boolean;
  blocked: boolean;
  submissionStatus?: string;
};

export function taskNextAction(state: DeliveryState) {
  if (state.frozen) return { label: "المهمة مؤرشفة", action: null };
  if (state.kind === "done") return { label: "المهمة مكتملة", action: null };
  if (state.kind === "review") return state.canReview && state.submissionStatus === "pending"
    ? { label: "مراجعة التسليم واتخاذ القرار", action: "review", button: "مراجعة التسليم" }
    : { label: "بانتظار قرار المراجع", action: null };
  if (!state.canWork) return { label: "بانتظار تسليم المسؤول", action: null };
  if (state.blocked) return { label: "معالجة العائق قبل التسليم", action: "block", button: "فتح العائق" };
  if (state.submissionStatus === "changes") return { label: "تطبيق الملاحظات ورفع النسخة المعدلة", action: "submit", button: "إعادة التسليم" };
  return { label: "رفع الملفات وإرسال التسليم", action: "submit", button: "تجهيز التسليم" };
}
