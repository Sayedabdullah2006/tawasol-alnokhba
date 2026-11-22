import {
  OFFICE_AGENTS,
  OfficeError,
  type OfficePlan,
  type SpecialistId,
} from "./domain";
import { departmentAgent, type DepartmentId } from "./departments";

const specialists = OFFICE_AGENTS.filter((a) => a.id !== "editor").map(
  (a) => a.id,
);
const role = { type: "string", enum: specialists };
const text = { type: "string" };
export const OFFICE_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: text,
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          agentId: role,
          reason: text,
          instruction: text,
          deliverable: text,
        },
        required: ["agentId", "reason", "instruction", "deliverable"],
      },
    },
    excluded: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { agentId: role, reason: text },
        required: ["agentId", "reason"],
      },
    },
  },
  required: ["summary", "steps", "excluded"],
};
/** A schema-compliant provider response is still untrusted until these domain bounds pass. */
export function parseOfficePlan(value: unknown): OfficePlan {
  const fail = () => {
    throw new OfficeError("تعذر التحقق من خطة الفريق؛ أعد إعداد الخطة");
  };
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail();
  const string = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length >= 3 && v.trim().length <= max
      ? v.trim()
      : fail();
  const agent = (v: unknown): SpecialistId =>
    specialists.includes(v as SpecialistId) ? (v as SpecialistId) : fail();
  const raw = object(value);
  if (
    !Array.isArray(raw.steps) ||
    raw.steps.length > 5 ||
    !Array.isArray(raw.excluded) ||
    raw.excluded.length > 5
  )
    return fail();
  const result: OfficePlan = {
    summary: string(raw.summary, 600),
    steps: raw.steps.map((v) => {
      const s = object(v);
      return {
        agentId: agent(s.agentId),
        reason: string(s.reason, 300),
        instruction: string(s.instruction, 1600),
        deliverable: string(s.deliverable, 600),
      };
    }),
    excluded: raw.excluded.map((v) => {
      const s = object(v);
      return { agentId: agent(s.agentId), reason: string(s.reason, 300) };
    }),
  };
  const all = [...result.steps, ...result.excluded].map((s) => s.agentId);
  if (all.length !== 5 || new Set(all).size !== 5) return fail();
  return result;
}
export function planAsText(
  plan: OfficePlan,
  department: DepartmentId = "content",
) {
  return `${plan.summary}\n\n${
    plan.steps.length
      ? plan.steps
          .map((s) => {
            const a = departmentAgent(department, s.agentId);
            return `${a.firstName}، ${a.name}: ${s.instruction}\nالتسليم: ${s.deliverable}`;
          })
          .join("\n\n")
      : "سأتولى الطلب بنفسي، ولا نحتاج تخصصات إضافية."
  }\n\nلن يبدأ التنفيذ قبل موافقتك على الخطة.`;
}
