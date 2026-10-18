import KnowledgeCenter from "@/components/workforce/KnowledgeCenter";
import { employeePageActor } from "@/lib/workforce/employee-page";
import { Suspense } from "react";
export default async function Page() {
  await employeePageActor();
  return (
    <Suspense fallback={<p>جارٍ التحميل…</p>}>
      <KnowledgeCenter admin={false} />
    </Suspense>
  );
}
