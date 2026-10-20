import { textField, uuid, WorkforceError } from "./validation";

export function knowledgeNotificationOptions(form: FormData) {
  let value: unknown;
  try { value = JSON.parse(String(form.get("notify_user_ids") || "[]")); }
  catch { throw new WorkforceError("اختر المستلمات من قائمة الموظفات"); }
  if (!Array.isArray(value) || value.length > 100)
    throw new WorkforceError("قائمة المستلمات غير صحيحة");
  const recipients = [...new Set(value.map(id => uuid(id).toLowerCase()))];
  const message = textField(form.get("notification_message") || "", "الرسالة", 0, 5000);
  if (!recipients.length && message) throw new WorkforceError("اختر مستلمة للرسالة");
  return { recipients, message };
}
