export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt,.csv,.zip";
export type TaskAttachment = {
  id: string;
  task_id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  purpose: "task" | "delivery";
  created_at: string;
  archived_at: string | null;
  created_by: string;
  sealed: boolean;
  canManage: boolean;
};
export type AttachmentList = {
  attachments: TaskAttachment[];
  count: number;
  page: number;
  canUpload: boolean;
};
