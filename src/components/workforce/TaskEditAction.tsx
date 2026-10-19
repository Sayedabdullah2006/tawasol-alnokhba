"use client";
import Link from "next/link";
import type { WorkTask } from "@/lib/workforce/task-types";

export function taskEditReason(task: WorkTask) {
  if (task.archived_at || task.board?.archived_at) return "استعد المهمة أو اللوحة من الأرشيف أولًا";
  if (["review", "done"].includes(task.column.kind)) return "تحتاج المهمة قرار المدير لإعادتها للتنفيذ قبل تعديلها";
  return "";
}

export default function TaskEditAction({ task, base, onOpen }: {
  task: WorkTask;
  base: string;
  onOpen?: (id: string, panel?: string) => void;
}) {
  if (!task.canEdit) return null;
  const reason = taskEditReason(task);
  const className = "inline-flex min-h-10 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900";
  if (reason) return <button type="button" disabled title={reason} className={`${className} cursor-not-allowed opacity-50`}>تعديل وإعادة الإسناد</button>;
  return (
    <Link
      draggable={false}
      href={`${base}/${task.id}?panel=edit`}
      className={className}
      aria-label={`تعديل وإعادة إسناد: ${task.title}`}
      onClick={onOpen ? (event) => {
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
          event.preventDefault();
          onOpen(task.id, "edit");
        }
      } : undefined}
    >
      تعديل وإعادة الإسناد
    </Link>
  );
}
