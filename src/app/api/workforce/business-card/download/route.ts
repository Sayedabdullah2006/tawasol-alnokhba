import { apiError, workforceActor } from "@/lib/workforce/server";
import { cardEditorData } from "@/lib/workforce/business-card-server";
import { renderCard, renderCardPdf } from "@/lib/workforce/business-card-render";
import { WorkforceError } from "@/lib/workforce/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await workforceActor(), data = await cardEditorData(actor);
    const params = new URL(request.url).searchParams;
    const preview = params.get("preview") === "true", draft = params.get("draft") === "true";
    const format = params.get("format") ?? "pdf", side = params.get("side") ?? "front";
    if (!["pdf", "png"].includes(format) || !["front", "back"].includes(side) || (draft && (!preview || format !== "png"))) throw new WorkforceError("صيغة غير مدعومة");
    if (!data.profile || (!draft && !data.profile.published)) throw new WorkforceError("احفظ البيانات وأصدر البطاقة أولًا", 404);
    const snapshot = draft ? { name: data.name, title: data.title, email: data.profile.work_email, phone: data.profile.work_phone, socials: data.profile.socials, company: data.company } : data.profile.published!;
    const bytes = format === "pdf" ? await renderCardPdf(snapshot, data.profile.slug) : await renderCard(snapshot, data.profile.slug, side as "front" | "back", draft);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "image/png", "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="nukhba-business-card${format === "png" ? `-${side}` : ""}.${format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
