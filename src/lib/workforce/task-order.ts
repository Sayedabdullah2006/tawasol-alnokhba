import type { WorkTask } from "./task-types";

export function compareTasks(sort: string, a: WorkTask, b: WorkTask) {
  if (sort === "due") {
    const left = a.due_at ? Date.parse(a.due_at) : Infinity;
    const right = b.due_at ? Date.parse(b.due_at) : Infinity;
    if (left !== right) return left < right ? -1 : 1;
  } else if (sort === "title") {
    const title = a.title.localeCompare(b.title, "ar");
    if (title) return title;
  } else if (sort === "position") {
    const position = Number(a.position) - Number(b.position);
    if (position) return position;
  }
  // Preserve the API's updated_at order for the explicit latest-update view.
  return sort === "updated" ? 0 : a.id.localeCompare(b.id);
}
