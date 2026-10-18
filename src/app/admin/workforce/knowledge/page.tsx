import KnowledgeCenter from "@/components/workforce/KnowledgeCenter";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<p>جارٍ التحميل…</p>}>
      <KnowledgeCenter admin />
    </Suspense>
  );
}
