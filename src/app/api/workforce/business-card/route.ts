import { apiError, assertMutation, createServiceRoleClient, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { WorkforceError } from "@/lib/workforce/validation";
import { professionalUrl, socialPlatforms } from "@/lib/workforce/business-card";
import { cardEditorData } from "@/lib/workforce/business-card-server";

export async function GET() {
  try { return privateResponse(await cardEditorData(await workforceActor())); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    const body = await request.json();
    if (!body || !["save", "issue", "revoke", "company"].includes(body.command) || !Number.isSafeInteger(body.version) || body.version < 0) throw new WorkforceError("تحقق من الطلب");
    const data: Record<string, unknown> = {};
    const input = body.data ?? {};
    const field = (key: string, limit: number) => {
      if (typeof input[key] !== "string" || input[key].trim().length > limit || /[\u0000-\u001f]/.test(input[key])) throw new WorkforceError("تحقق من الحقول المدخلة");
      return input[key].trim();
    };
    if (body.command === "save") {
      data.display_name = actor.employee?.full_name ?? field("display_name", 70);
      data.job_title = actor.employee?.job_title ?? field("job_title", 80);
      data.work_email = field("work_email", 120);
      data.work_phone = field("work_phone", 30);
      if (data.work_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.work_email))) throw new WorkforceError("أدخل بريد العمل بشكل صحيح");
      if (data.work_phone && !/^\+?[0-9 ()-]{6,30}$/.test(String(data.work_phone))) throw new WorkforceError("أدخل رقم العمل بشكل صحيح");
      if (!input.socials || typeof input.socials !== "object" || Array.isArray(input.socials)) throw new WorkforceError("تحقق من روابط التواصل");
      const socials: Record<string, string> = {};
      for (const [key, value] of Object.entries(input.socials)) {
        const platform = socialPlatforms.find(p => p.key === key);
        if (!platform || typeof value !== "string") throw new WorkforceError("رابط تواصل غير مدعوم");
        if (!value.trim()) continue;
        try { socials[key] = professionalUrl(value.trim(), platform.hosts); }
        catch { throw new WorkforceError(`أدخل رابط ${platform.label} كاملًا يبدأ بـ https://`); }
      }
      data.socials = socials;
    }
    if (body.command === "company") {
      if (actor.role !== "admin") throw new WorkforceError("متاح لمدير النظام فقط", 403);
      for (const [key, max] of [["name", 70], ["tagline", 100], ["website", 200], ["email", 120], ["phone", 30], ["address", 150]] as const) data[key] = field(key, max);
      try { data.website = professionalUrl(String(data.website)); } catch { throw new WorkforceError("أدخل رابط الشركة الصحيح"); }
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) throw new WorkforceError("أدخل بريد الشركة الصحيح");
      if (data.phone && !/^\+?[0-9 ()-]{6,30}$/.test(String(data.phone))) throw new WorkforceError("أدخل هاتف الشركة الصحيح");
    }
    const result = await (await createServiceRoleClient()).rpc("wf_business_card_command", { p_actor: actor.user.id, p_version: body.version, p_command: body.command, p_data: data });
    if (result.error) throw result.error;
    return privateResponse(await cardEditorData(actor));
  } catch (error) { return apiError(error); }
}
