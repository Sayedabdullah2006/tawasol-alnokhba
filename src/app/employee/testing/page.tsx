import { redirect } from "next/navigation";
import { workforceActor } from "@/lib/workforce/server";
import { WorkforceError } from "@/lib/workforce/validation";
import WorkforceTestMode from "@/components/workforce/WorkforceTestMode";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  try {
    await workforceActor();
  } catch (e) {
    if (e instanceof WorkforceError && e.status === 401)
      redirect(
        `/auth/login?next=${encodeURIComponent(`/employee/testing${run ? `?run=${run}` : ""}`)}`,
      );
    throw e;
  }
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <WorkforceTestMode joinRun={run} />
    </div>
  );
}
