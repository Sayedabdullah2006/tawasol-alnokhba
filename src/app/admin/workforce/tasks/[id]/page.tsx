import TaskDetail from "@/components/workforce/TaskDetail";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  requireAdmin(await workforceActor());
  const { id } = await params;
  return <TaskDetail key={id} id={id} admin />;
}
