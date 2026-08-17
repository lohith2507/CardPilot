import Groq from "groq-sdk";
import type { ZodType } from "zod";

/**
 * Both models below support `strict: true`, which uses constrained decoding —
 * the model physically cannot emit output that violates the schema. Everything
 * still passes through Zod afterwards, because a schema-valid response can
 * carry nonsense values.
 */
export const MODEL_FAST = "openai/gpt-oss-20b";
export const MODEL_SMART = "openai/gpt-oss-120b";

/**
 * Groq runs the search server-side and folds the results into the answer, so no
 * separate search API key is needed. It cannot be combined with a JSON schema,
 * which is why looking a card up is two calls: this one gathers the facts, then
 * MODEL_SMART turns that prose into rules under constrained decoding.
 *
 * The mini variant, not the full one. Search results arrive as many thousands of
 * tokens of page text, and the full system inherits the 8,000-per-minute budget
 * of the model behind it, so every lookup came back 413. Mini is budgeted
 * separately and far more generously, which is what makes this affordable.
 */
export const MODEL_SEARCH = "groq/compound-mini";

export class GroqSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqSchemaError";
  }
}

export class GroqNotConfiguredError extends Error {
  constructor() {
    super("GROQ_API_KEY is not set. Add it to .env.local to enable AI lookups.");
    this.name = "GroqNotConfiguredError";
  }
}

export class GroqRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super(
      retryAfterSeconds
        ? `Groq's rate limit was hit. Try again in about ${retryAfterSeconds} seconds.`
        : "Groq's rate limit was hit. Wait a moment and try again.",
    );
    this.name = "GroqRateLimitError";
  }
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

let client: Groq | null = null;

function getClient(): Groq {
  if (!isGroqConfigured()) throw new GroqNotConfiguredError();
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY!.trim() });
  return client;
}

export type JsonSchema = Record<string, unknown>;

type StructuredRequest<T> = {
  model?: string;
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  validator: ZodType<T>;
  temperature?: number;
  maxTokens?: number;
};

export async function structuredCompletion<T>({
  model = MODEL_FAST,
  system,
  user,
  schemaName,
  schema,
  validator,
  temperature = 0,
  maxTokens = 1200,
}: StructuredRequest<T>): Promise<T> {
  let completion;
  try {
    completion = await getClient().chat.completions.create({
      model,
      temperature,
      // Counts toward the per-minute token budget even if unused, so keep it
      // close to what the schema actually needs.
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    });
  } catch (err) {
    throw translateGroqError(err);
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Groq returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return validator.parse(parsed);
}

export type SearchAnswer = {
  text: string;
  /** Pages the search actually opened, so a claim can be traced back. */
  sources: string[];
};

/** A plain completion that may search the web before answering. */
export async function searchCompletion({
  system,
  user,
  maxTokens = 1600,
}: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<SearchAnswer> {
  let completion;
  try {
    completion = await getClient().chat.completions.create({
      model: MODEL_SEARCH,
      temperature: 0,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
  } catch (err) {
    throw translateGroqError(err);
  }

  const message = completion.choices[0]?.message;
  const text = message?.content?.trim() ?? "";
  if (!text) throw new Error("The web search came back empty.");
  return { text, sources: collectSources(message) };
}

/**
 * The SDK does not type the record of server-side tool calls, so the URLs are
 * recovered from the raw tool output rather than a documented shape.
 */
function collectSources(message: unknown): string[] {
  const executed = (message as { executed_tools?: unknown[] } | undefined)?.executed_tools;
  if (!Array.isArray(executed)) return [];

  const seen = new Set<string>();
  for (const tool of executed) {
    const output = (tool as { output?: unknown }).output;
    if (typeof output !== "string") continue;
    for (const match of output.matchAll(/https?:\/\/[^\s"'\\<>)\]]+/g)) {
      const url = match[0].replace(/[.,;]+$/, "");
      if (url.length < 200) seen.add(url);
      if (seen.size >= 8) return [...seen];
    }
  }
  return [...seen];
}

/**
 * Groq answers 429 for requests-per-minute and 413 when a single request's
 * prompt plus max_completion_tokens exceeds the per-minute token budget. Both
 * mean "too much, too fast" and deserve the same advice. A 400 with
 * json_validate_failed usually means the model wrote prose or invalid shape
 * instead of the schema — surface that as something you can act on.
 */
function translateGroqError(err: unknown): Error {
  const status = (err as { status?: number }).status;
  if (status === 429 || status === 413) {
    const header = (err as { headers?: Record<string, string> }).headers?.["retry-after"];
    const retryAfter = header ? Number.parseInt(header, 10) : null;
    return new GroqRateLimitError(Number.isFinite(retryAfter) ? retryAfter : null);
  }

  const message = err instanceof Error ? err.message : String(err);
  if (status === 400 && /json_validate_failed|Failed to generate JSON|does not match the expected schema/i.test(message)) {
    return new GroqSchemaError(
      "The model could not turn that source into card rules. Try a more specific card name (for example Chase Sapphire Preferred), or paste the rewards section from the issuer's page.",
    );
  }

  return err instanceof Error ? err : new Error(String(err));
}

/** JSON Schema strict mode requires every key listed and no extras. */
export function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
