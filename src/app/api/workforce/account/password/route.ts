import { createClient } from "@supabase/supabase-js";
import { apiError, assertMutation, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { WorkforceError } from "@/lib/workforce/validation";

export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    const { currentPassword, newPassword, nonce } = await request.json();
    if (typeof currentPassword !== "string" || currentPassword.length < 1 || currentPassword.length > 128 || typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128 || newPassword === currentPassword || (nonce && (typeof nonce !== "string" || !/^\d{6,10}$/.test(nonce)))) throw new WorkforceError("أدخل كلمة المرور الحالية وكلمة جديدة مختلفة من 12 حرفًا على الأقل");
    // Verify explicitly even when the project's optional current-password policy is off.
    // This client has no cookies, storage, persistence or service-role privileges.
    const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const checked = await verifier.auth.signInWithPassword({ email: actor.user.email!, password: currentPassword });
    if (checked.error || checked.data.user?.id !== actor.user.id) throw new WorkforceError("كلمة المرور الحالية غير صحيحة أو تعذر التحقق منها", 400);
    // Revoke the verification session, keeping the interactive session intact.
    await verifier.auth.signOut({ scope: "local" });
    const { error } = await actor.db.auth.updateUser({ password: newPassword, current_password: currentPassword, ...(nonce ? { nonce } : {}) });
    if (error) {
      if (["reauthentication_needed", "reauthentication_not_valid"].includes(error.code ?? "")) {
        if (!nonce) await actor.db.auth.reauthenticate();
        return privateResponse({ error: "أدخل رمز التأكيد المرسل إلى بريدك", needsNonce: true }, 400);
      }
      throw new WorkforceError(error.code === "weak_password" ? "اختر كلمة مرور أقوى" : "تعذر تغيير كلمة المرور؛ سجّل الدخول مجددًا وحاول مرة أخرى", 400);
    }
    return privateResponse({ success: true });
  } catch (error) { return apiError(error); }
}
