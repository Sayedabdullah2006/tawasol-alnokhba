import "server-only";
import { workforceActor } from "./server";
import type { BusinessProfile, CardCompany, CardEditorData } from "./business-card";

export async function cardEditorData(actor: Awaited<ReturnType<typeof workforceActor>>): Promise<CardEditorData> {
  const [profile, company] = await Promise.all([
    actor.db.from("wf_business_profiles").select("*").eq("user_id", actor.user.id).maybeSingle(),
    actor.db.from("wf_card_company").select("*").eq("id", true).single(),
  ]);
  if (profile.error) throw profile.error;
  if (company.error) throw company.error;
  const own = profile.data as BusinessProfile | null;
  return { profile: own, company: company.data as CardCompany, name: actor.employee?.full_name ?? own?.display_name ?? "", title: actor.employee?.job_title ?? own?.job_title ?? "", admin: actor.role === "admin" };
}
