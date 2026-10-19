import "server-only";
import { createHash } from "node:crypto";
import { validateAttachment } from "./attachment-server";
import { MAX_KNOWLEDGE_BYTES } from "./knowledge";
import { WorkforceError } from "./validation";

export async function validateKnowledgeUpload(file: File) {
  if (!file.size)
    throw new WorkforceError("الملف فارغ؛ اختر ملفًا يحتوي على بيانات");
  if (file.size > MAX_KNOWLEDGE_BYTES)
    throw new WorkforceError("الحد الأقصى للملف 50 ميجابايت", 413);
  const filename = file.name
    .replace(/[\u0000-\u001f\u007f\\/\u202a-\u202e\u2066-\u2069]/g, "_")
    .trim()
    .slice(0, 200) || "ملف";
  const extension = filename.includes(".")
    ? "." + filename.split(".").pop()!.toLowerCase()
    : "";
  if ([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv"].includes(extension)) {
    try {
      return await validateAttachment(file, MAX_KNOWLEDGE_BYTES);
    } catch {
      // A file that cannot be safely previewed can still be archived and
      // downloaded, including encrypted/legacy or differently encoded content.
    }
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // Every other format is stored unchanged and served as a download, never
  // trusting the client MIME declaration to enable inline browser execution.
  return {
    bytes,
    filename,
    mime: "application/octet-stream",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
