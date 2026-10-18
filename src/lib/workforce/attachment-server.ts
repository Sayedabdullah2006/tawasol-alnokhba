import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
import { WorkforceError } from "./validation";
import type { WorkforceActor } from "./server";

export const ATTACHMENT_BUCKET = "workforce-task-files";
export const attachmentColumns =
  "id,task_id,title,filename,mime_type,size_bytes,purpose,created_by,created_at,archived_at";
export async function attachmentTask(
  actor: WorkforceActor,
  id: string,
  write = false,
) {
  const { data: task, error } = await actor.db
    .from("wf_tasks")
    .select(
      "id,assignee_id,archived_at,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)",
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<
      {
        id: string;
        assignee_id: string | null;
        archived_at: string | null;
        column: { kind: string };
        board: { archived_at: string | null };
      },
      { merge: false }
    >();
  if (error) throw error;
  if (!task) throw new WorkforceError("المهمة غير متاحة", 404);
  const editable =
    !task.archived_at &&
    !task.board.archived_at &&
    !["review", "done"].includes(task.column.kind);
  const owner =
    actor.role === "admin" || actor.employee?.id === task.assignee_id;
  if (write && !owner)
    throw new WorkforceError("يمكنك الإرفاق على مهامك فقط", 403);
  return { task, canUpload: owner && editable, editable };
}

/** Bound the actual body, including chunked requests, before parsing multipart. */
export async function attachmentForm(request: Request) {
  const limit = MAX_ATTACHMENT_BYTES + 128 * 1024;
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new WorkforceError("الحد الأقصى للملف 4 ميجابايت", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkforceError("اختر ملفًا");
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new WorkforceError("الحد الأقصى للملف 4 ميجابايت", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(parts);
  try {
    return await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw new WorkforceError("صيغة رفع الملف غير صحيحة");
  }
}

export async function validateAttachment(file: File) {
  if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES)
    throw new WorkforceError("اختر ملفًا غير فارغ حتى 4 ميجابايت", 413);
  const filename = file.name
    .replace(/[\u0000-\u001f\u007f\\/\u202a-\u202e\u2066-\u2069]/g, "_")
    .trim()
    .slice(0, 200);
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const bytes = Buffer.from(await file.arrayBuffer());
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip",
  };
  const mime = types[ext];
  if (!mime)
    throw new WorkforceError(
      "نوع الملف غير مدعوم. استخدم الأنواع الموضحة في النموذج",
    );
  try {
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      const image = sharp(bytes, {
        limitInputPixels: 40000000,
        animated: false,
      });
      const meta = await image.metadata();
      if (meta.format !== (ext === "jpg" || ext === "jpeg" ? "jpeg" : ext))
        throw new Error();
      // Decode the pixels too, rejecting truncated images before making them available inline.
      await image.clone().resize({ width: 1, height: 1 }).toBuffer();
    } else if (ext === "pdf") {
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error();
      await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
    } else if (["docx", "xlsx", "pptx", "zip"].includes(ext)) {
      if (
        bytes.readUInt32LE(0) !== 0x04034b50 &&
        bytes.readUInt32LE(0) !== 0x06054b50
      )
        throw new Error();
      const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      if (end < 0 || end + 22 > bytes.length || end < bytes.length - 65557)
        throw new Error();
      const entries = bytes.readUInt16LE(end + 10),
        size = bytes.readUInt32LE(end + 12),
        offset = bytes.readUInt32LE(end + 16);
      if (entries > 10000 || offset + size > end) throw new Error();
      const names = new Set<string>();
      let cursor = offset;
      for (let index = 0; index < entries; index++) {
        if (
          cursor + 46 > offset + size ||
          bytes.readUInt32LE(cursor) !== 0x02014b50
        )
          throw new Error();
        const length = bytes.readUInt16LE(cursor + 28),
          extra = bytes.readUInt16LE(cursor + 30),
          comment = bytes.readUInt16LE(cursor + 32);
        const next = cursor + 46 + length + extra + comment;
        if (next > offset + size) throw new Error();
        names.add(
          bytes.subarray(cursor + 46, cursor + 46 + length).toString("utf8"),
        );
        cursor = next;
      }
      if (cursor !== offset + size) throw new Error();
      if (ext !== "zip") {
        // Read only central directory names; never unpack user files onto the host.
        const required = {
          docx: "word/document.xml",
          xlsx: "xl/workbook.xml",
          pptx: "ppt/presentation.xml",
        }[ext]!;
        if (!names.has("[Content_Types].xml") || !names.has(required))
          throw new Error();
      }
    } else {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
        throw new Error();
    }
  } catch {
    throw new WorkforceError("محتوى الملف لا يطابق نوعه أو الملف تالف");
  }
  return {
    bytes,
    filename,
    mime,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
