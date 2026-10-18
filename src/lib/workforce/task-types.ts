export const TASK_STATES = {
  new: "جديدة",
  in_progress: "قيد التنفيذ",
  review: "بانتظار المراجعة",
  changes: "تحتاج تعديلًا",
  done: "مكتملة",
} as const;
export const TASK_PRIORITIES = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
} as const;
export type TaskColumn = {
  id: string;
  title: string;
  kind: keyof typeof TASK_STATES;
  position: number;
  archived_at: string | null;
};
export type WorkBoard = {
  id: string;
  title: string;
  description: string;
  allow_self_tasks: boolean;
  archived_at: string | null;
  version: number;
};
export type WorkTask = {
  client_name: string;
  assigneeName?: string | null;
  canWork?: boolean;
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  completion_criteria: string;
  assignee_id: string | null;
  assignment_origin: "admin" | "self";
  priority: keyof typeof TASK_PRIORITIES;
  starts_at: string | null;
  due_at: string | null;
  estimate_minutes: number | null;
  requires_approval: boolean;
  shared_with_board: boolean;
  blocked_reason: string;
  archived_at: string | null;
  version: number;
  column: TaskColumn;
  board?: WorkBoard;
};
export type BoardDetail = {
  board: WorkBoard;
  columns: TaskColumn[];
  canManage: boolean;
  canCreate: boolean;
};
export type TaskSubmission = {
  id: string;
  summary: string;
  status: "pending" | "approved" | "changes";
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
  submission_number: number;
};
export type TaskDetail = {
  task: WorkTask;
  canWork: boolean;
  canEdit: boolean;
  canReview: boolean;
  assigneeName: string | null;
  latestSubmission: TaskSubmission | null;
  checklist: ChecklistItem[];
};
export type ChecklistItem = {
  id: string;
  title: string;
  required: boolean;
  completed: boolean;
  completed_at: string | null;
};
export type TaskHistory = {
  events: {
    id: number;
    action: string;
    summary: string;
    changed_fields: string[];
    created_at: string;
    actorName: string;
  }[];
  submissions: TaskSubmission[];
  count: number;
  page: number;
};
export function workDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Riyadh",
      }).format(new Date(value))
    : "غير محدد";
}
export type TaskComment = {
  id: string;
  body: string;
  version: number;
  authorName: string;
  created_at: string;
  edited_at: string | null;
  archived_at: string | null;
  canEdit: boolean;
  canArchive: boolean;
};
export type CommentRevision = {
  version: number;
  body: string;
  archived: boolean;
  action: "create" | "edit" | "archive" | "restore";
  actorName: string;
  created_at: string;
};
