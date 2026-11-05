import {provePassword} from '@/lib/auth-password-proof';
import {consumeSsoAttempt} from '@/lib/sso-attempt';
import { apiError, assertMutation, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { WorkforceError } from "@/lib/workforce/validation";

export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    const { currentPassword, newPassword, nonce } = await request.json();
    if (typeof currentPassword !== "string" || currentPassword.length < 1 || currentPassword.length > 128 || typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128 || newPassword === currentPassword || (nonce && (typeof nonce !== "string" || !/^\d{6,10}$/.test(nonce)))) throw new WorkforceError("أدخل كلمة المرور الحالية وكلمة جديدة مختلفة من 12 حرفًا على الأقل");
    if(!await consumeSsoAttempt(actor.user.email!,request))throw new WorkforceError('محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',429);
    // The actor/session and mutation Origin were already verified. Rate-limit
    // this own-account proof independently; it must work with Auth CAPTCHA on.
    const checked=await provePassword(actor.user.email!,currentPassword,actor.user.id);
    if(!checked.ok)throw new WorkforceError("كلمة المرور الحالية غير صحيحة أو تعذر التحقق منها",400);
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
