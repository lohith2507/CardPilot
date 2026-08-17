/**
 * NVIDIA NIM (OpenAI-compatible). Used as a second structured-JSON worker so
 * Groq can stay on web search without burning its JSON-schema budget twice.
 * https://integrate.api.nvidia.com/v1
 */

export const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

export class NvidiaNotConfiguredError extends Error {
  constructor() {
    super("NVIDIA_API_KEY is not set.");
    this.name = "NvidiaNotConfiguredError";
  }
}

export function isNvidiaConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY?.trim());
}

export async function nvidiaJsonCompletion(options: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<unknown> {
  if (!isNvidiaConfigured()) throw new NvidiaNotConfiguredError();

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.NVIDIA_API_KEY!.trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      temperature: 0,
      max_tokens: options.maxTokens ?? 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`NVIDIA lookup failed (${res.status}). ${detail.slice(0, 180)}`);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("NVIDIA returned an empty response.");
  return parseJsonObject(raw);
}

export function parseJsonObject(raw: string): unknown {
  const trimmed = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error(`NVIDIA returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
