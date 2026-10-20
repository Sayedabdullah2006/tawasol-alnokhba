export type KnowledgeFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  system_key: string | null;
  version: number;
  direct_file_count: number;
  file_count: number;
};
export type KnowledgeFile = {
  id: string;
  folder_id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  created_by: string;
  uploaderName: string;
  deleted_at: string | null;
  version: number;
  task_attachment_id: string | null;
  taskId: string | null;
  canManage: boolean;
  canTrash: boolean;
  sealed: boolean;
};
export type KnowledgeData = {
  folders: KnowledgeFolder[];
  files: KnowledgeFile[];
  uploaders: { id: string; full_name: string }[];
  count: number;
  page: number;
  admin: boolean;
};
export const MAX_KNOWLEDGE_BYTES = 50 * 1024 * 1024;
export const KNOWLEDGE_INLINE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
];
