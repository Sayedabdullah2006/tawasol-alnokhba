import TaskDetail from "@/components/workforce/TaskDetail";
import { employeePageActor } from "@/lib/workforce/employee-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await employeePageActor();
  const { id } = await params;
  return <TaskDetail key={id} id={id} admin={false} />;
}
