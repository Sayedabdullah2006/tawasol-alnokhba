export const TASK_SCOPES = {
  executing: "مهامي المسندة إليّ",
  assigned: "المسندة إليّ فقط",
  participant: "مشاركتي السابقة — للقراءة",
  watcher: "أتابعها للقراءة",
} as const;

// Apply after filtering the empty my_membership embed to the current employee.
// The OR keeps primary assignments even when there is no extra membership row.
export const executionScope = (employeeId: string) =>
  `assignee_id.eq.${employeeId}`;
