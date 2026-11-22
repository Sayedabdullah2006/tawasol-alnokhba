import {
  currentAgent,
  stepsFor,
  type AgentId,
  type OfficeActivity,
  type OfficeMessage,
  type OfficeSession,
} from "./domain";

/** Present old Markdown as text without interpreting HTML or changing stored evidence. */
export function plainOfficeText(text: string) {
  return text
    .replace(/^\s*```[^\n]*\n?/gm, "")
    .replace(/^\s{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^\s{0,3}>[ \t]?/gm, "")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([\s\S]+?)\*\*|__([\s\S]+?)__/g, (_, a, b) => a || b)
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, row: string) =>
      row
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · "),
    )
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function officeExcerpt(text: string, length = 85) {
  const clean = plainOfficeText(text).replace(/\s+/g, " ");
  return clean.length > length
    ? `${clean.slice(0, length - 1).trimEnd()}…`
    : clean;
}
export function firstName(name: string) {
  const words = name.trim().split(/\s+/);
  return words[0] === "عبد" && words[1]
    ? words.slice(0, 2).join(" ")
    : words[0];
}
/** Newest relevant contribution per role; cancelled/failed sessions never become results. */
export function officeActivities(
  sessions: OfficeSession[],
  messages: Pick<
    OfficeMessage,
    "id" | "session_id" | "agent_id" | "kind" | "content" | "created_at"
  >[],
): OfficeActivity[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const found = new Map<AgentId, OfficeActivity>();
  const ordered = [...messages].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  for (const m of ordered) {
    const s = byId.get(m.session_id);
    if (
      !s ||
      s.status === "cancelled" ||
      s.status === "failed" ||
      m.kind === "event"
    )
      continue;
    const id = m.agent_id ?? s.agent_id;
    if (!found.has(id))
      found.set(id, {
        agentId: id,
        sessionId: s.id,
        messageId: m.id,
        kind:
          m.kind === "user"
            ? "question"
            : s.status === "review" || s.status === "completed"
              ? "result"
              : "reply",
        preview: officeExcerpt(m.content),
      });
  }
  const waiting = sessions.find((s) => s.status === "handoff");
  if (waiting) {
    const previous = stepsFor(waiting.kind, waiting.agent_id)[waiting.step - 1];
    const output = ordered.find(
      (m) =>
        m.session_id === waiting.id &&
        m.agent_id === previous &&
        m.kind === "assistant",
    );
    found.set("editor", {
      agentId: "editor",
      sessionId: waiting.id,
      messageId: output?.id,
      kind: "handoff",
      preview: officeExcerpt(output?.content || waiting.title),
    });
  }
  const assigned = new Set<AgentId>();
  for (const s of [
    ...sessions.filter((s) => s.status === "running"),
    ...sessions.filter((s) => s.status === "queued"),
  ]) {
    const id = currentAgent(s);
    if (assigned.has(id) || (waiting && id === "editor")) continue;
    assigned.add(id);
    if (found.get(id)?.sessionId !== s.id)
      found.set(id, {
        agentId: id,
        sessionId: s.id,
        kind: "question",
        preview: officeExcerpt(s.brief),
      });
  }
  return [...found.values()];
}
