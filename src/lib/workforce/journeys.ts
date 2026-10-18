export const journeySections = {
  goal: { title: "الأهداف", employee: "performance/goals" },
  review: { title: "التقييم وخطة التطوير", employee: "performance/reviews" },
  appeal: { title: "مراجعة التقييم", employee: "requests/performance-review" },
  advance: { title: "السلف والالتزامات", employee: "finance/advances" },
  asset: { title: "العهد", employee: "profile/assets" },
  onboarding: { title: "التهيئة وتسليم العمل", employee: "profile/onboarding" },
  policy: { title: "سياسات الشركة", employee: "profile/policies" },
  preferences: {
    title: "تفضيلات التنبيهات",
    employee: "notifications/preferences",
  },
} as const;
export type JourneyKind = keyof typeof journeySections;
export const journeyStates: Record<JourneyKind, string[]> = {
  goal: ["active", "submitted", "approved", "changes"],
  review: ["active", "submitted", "published", "changes"],
  appeal: ["pending", "approved", "rejected"],
  advance: ["active", "settled"],
  asset: ["active", "approved", "return_requested", "returned"],
  onboarding: ["active", "submitted", "approved", "changes"],
  policy: ["active", "published"],
  preferences: [],
};
export const journeyStatus: Record<string, string> = {
  active: "نشط",
  submitted: "بانتظار الاعتماد",
  approved: "معتمد",
  changes: "يحتاج تعديلًا",
  published: "منشور",
  pending: "بانتظار القرار",
  rejected: "مرفوض",
  return_requested: "بانتظار الاستلام",
  returned: "معاد",
  settled: "مسدد",
};
export const notificationGroups = {
  tasks: "المهام",
  requests: "الطلبات",
  finance: "المستحقات",
  hr: "شؤون الموظفين",
  reminders: "التذكيرات",
} as const;
export type Preferences = Record<
  keyof typeof notificationGroups,
  { inbox: boolean; email: boolean }
>;
export const defaultPreferences = () =>
  Object.fromEntries(
    Object.keys(notificationGroups).map((k) => [
      k,
      { inbox: true, email: true },
    ]),
  ) as Preferences;
export type JourneyItem = {
  id: string;
  kind: Exclude<JourneyKind, "preferences">;
  employee_id: string | null;
  parent_id: string | null;
  title: string;
  details: string;
  status: string;
  due_on: string | null;
  target: number;
  progress: number;
  principal: number;
  repaid: number;
  installment: number;
  score: number | null;
  self_score: number | null;
  response: string;
  admin_note: string;
  checklist: { id: string; title: string; done: boolean }[];
  version: number;
  created_at: string;
  updated_at: string;
};
export type JourneyEvent = {
  id: number;
  item_id: string;
  action: string;
  note: string;
  amount: number | null;
  created_at: string;
};
export type JourneyData = {
  items: JourneyItem[];
  events: JourneyEvent[];
  receipts: { item_id: string; user_id: string; acknowledged_at: string }[];
  employees: { id: string; full_name: string }[];
  reviews: JourneyItem[];
  advanceRequests: {
    id: string;
    title: string;
    amount: number;
    employee_id: string;
  }[];
  count: number;
  page: number;
  admin: boolean;
  userId: string;
  preferences: { version: number; settings: Preferences };
};
