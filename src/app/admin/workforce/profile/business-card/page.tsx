import { workforceActor, requireAdmin } from "@/lib/workforce/server";
import { cardEditorData } from "@/lib/workforce/business-card-server";
import BusinessCardEditor from "@/components/workforce/BusinessCardEditor";
export default async function AdminBusinessCardPage() {
  const actor = await workforceActor(); requireAdmin(actor);
  return <BusinessCardEditor initial={await cardEditorData(actor)} />;
}
