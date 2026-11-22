import "server-only";
import https from "node:https";
import type { Citation } from "./domain";

/** Replace this adapter to use Claude/another provider without changing the office. */
export interface OfficeProvider {
  run(input: {
    system: string;
    prompt: string;
    search: boolean;
    jsonSchema?: { name: string; schema: Record<string, unknown> };
  }): Promise<{
    text: string;
    citations: Citation[];
    inputTokens: number;
    outputTokens: number;
  }>;
}
export function runtimeInfo() {
  return {
    configured: !!process.env.OPENAI_API_KEY,
    provider: "OpenAI",
    model: process.env.VIRTUAL_OFFICE_MODEL || "gpt-5.5",
  };
}
type ResponseBody = {
  status?: string;
  output?: {
    type: string;
    content?: {
      type: string;
      text?: string;
      annotations?: { type: string; title?: string; url?: string }[];
    }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};
function requestResponse(body: unknown): Promise<ResponseBody> {
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(JSON.stringify(body));
    const req = https.request(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        agent: new https.Agent({ keepAlive: false }),
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": bytes.length,
          ...(process.env.OPENAI_PROJECT_ID
            ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID }
            : {}),
        },
        timeout: 110000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 3_000_000) {
            res.destroy();
            reject(new Error("provider_response_too_large"));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 300)
            return reject(new Error(`provider_http_${res.statusCode}`));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("provider_invalid_json"));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("provider_timeout")));
    req.end(bytes);
  });
}
export const officeProvider: OfficeProvider = {
  async run({ system, prompt, search, jsonSchema }) {
    if (!runtimeInfo().configured) throw new Error("provider_not_configured");
    const result = await requestResponse({
      model: runtimeInfo().model,
      store: false,
      instructions: system,
      input: prompt,
      ...(runtimeInfo().model.startsWith("gpt-5")
        ? { reasoning: { effort: "low" } }
        : {}),
      max_output_tokens: 5000,
      ...(jsonSchema
        ? {
            text: {
              format: { type: "json_schema", strict: true, ...jsonSchema },
            },
          }
        : {}),
      ...(search
        ? {
            tools: [{ type: "web_search" }],
            tool_choice: "required",
            max_tool_calls: 3,
          }
        : {}),
    });
    if (result.status !== "completed") throw new Error("provider_incomplete");
    const texts: string[] = [];
    const citations: Citation[] = [];
    for (const item of result.output ?? [])
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) texts.push(part.text);
        for (const link of part.annotations ?? [])
          if (
            link.type === "url_citation" &&
            link.url &&
            /^https?:\/\//i.test(link.url) &&
            !citations.some((c) => c.url === link.url)
          )
            citations.push({
              title: link.title || new URL(link.url).hostname,
              url: link.url,
            });
      }
    if (!texts.length) throw new Error("provider_empty_response");
    return {
      text: texts.join("\n\n"),
      citations,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    };
  },
};
