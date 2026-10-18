import TaskDetail from "@/components/workforce/TaskDetail";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{panel?:string}> }) {
  requireAdmin(await workforceActor());
  const { id } = await params;
  const panel=(await searchParams).panel;
  return <TaskDetail initialPanel={panel==="submit"?"submit":"brief"} key={id} id={id} admin />;
}
