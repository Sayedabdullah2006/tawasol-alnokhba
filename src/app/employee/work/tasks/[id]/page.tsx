import TaskDetail from "@/components/workforce/TaskDetail";
import { employeePageActor } from "@/lib/workforce/employee-page";
export default async function Page({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{panel?:string}> }) {
  await employeePageActor();
  const { id } = await params;
  const panel=(await searchParams).panel;
  return <TaskDetail initialPanel={panel==="submit"?"submit":"brief"} key={id} id={id} admin={false} />;
}
