import "server-only";
import { validateWorkforceUpload } from "./file-upload-server";
import { MAX_KNOWLEDGE_BYTES } from "./knowledge";

export function validateKnowledgeUpload(file: File) {
  return validateWorkforceUpload(file, MAX_KNOWLEDGE_BYTES);
}
