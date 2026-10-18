import { employeePageActor } from "@/lib/workforce/employee-page";
import { cardEditorData } from "@/lib/workforce/business-card-server";
import BusinessCardEditor from "@/components/workforce/BusinessCardEditor";
export default async function BusinessCardPage() {
  return <BusinessCardEditor initial={await cardEditorData(await employeePageActor())} />;
}
