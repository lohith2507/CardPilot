import { z } from "zod";
import { MODEL_SMART, strictObject, structuredCompletion } from "@/lib/groq";
import { expandMccCodes, inferMccCodes, MCC_REFERENCE } from "@/lib/mcc";

export type ExtractedRule = {
  label: string;
  mccCodes: number[];
  merchantSlugs: string[];
  rate: number;
  capAmountCents: number | null;
  capPeriod: "month" | "quarter" | "year" | "none";
  requiresActivation: boolean;
  selectionGroup: string | null;
  validFrom: string | null;
  validTo: string | null;
  priority: number;
  notes: string;
};

export type ExtractedCard = {
  slug: string;
  issuer: string;
  product: string;
  network: "visa" | "mastercard" | "amex" | "discover";
  annualFeeCents: number;
  fxFeePct: number;
  baseRate: number;
  currencyCode: string;
  currencyName: string;
  currencyDefaultCpp: number;
  currencyIsCashback: boolean;
  colorFrom: string;
  colorTo: string;
  notes: string;
  sourceUrl: string;
  /** Pages a web lookup read, empty when you supplied the terms yourself. */
  sources: string[];
  /** The model's own flag that something in the source was ambiguous. */
  uncertainties: string[];
  rules: ExtractedRule[];
};

/**
 * Nothing here is nullable. Constrained decoding is far more reliable when the
 * schema is a flat set of required scalars, so "absent" is encoded as 0 or "",
 * and normalised into real nulls afterwards.
 */
const rawRuleSchema = z.object({
  label: z.string(),
  mccCodes: z.array(z.any()).transform(expandMccCodes),
  merchantSlugs: z.array(z.string()),
  rate: z.number(),
  capAmountCents: z.number().int(),
  capPeriod: z.enum(["month", "quarter", "year", "none"]),
  requiresActivation: z.boolean(),
  selectionGroup: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  priority: z.number().int(),
  notes: z.string(),
});

const rawCardSchema = z.object({
  issuer: z.string().min(1),
  product: z.string().min(1),
  network: z.enum(["visa", "mastercard", "amex", "discover"]),
  annualFeeCents: z.number().int().min(0),
  fxFeePct: z.number().min(0).max(10),
  baseRate: z.number().min(0).max(50),
  currencyCode: z.string().min(1),
  currencyName: z.string(),
  currencyDefaultCpp: z.number().min(0).max(100),
  currencyIsCashback: z.boolean(),
  colorFrom: z.string(),
  colorTo: z.string(),
  notes: z.string(),
  uncertainties: z.array(z.string()),
  rules: z.array(rawRuleSchema),
});

/** Used in tests to prove a model that glued MCC codes together still parses. */
export function parseExtractedRaw(data: unknown) {
  return rawCardSchema.parse(data);
}

const RULE_PROPERTIES: Record<string, Record<string, unknown>> = {
  label: { type: "string", description: "Short category name as the issuer words it, e.g. 'US supermarkets'." },
  mccCodes: {
    type: "array",
    description:
      'Each entry is one 4-digit merchant category code written as a string, e.g. "5812". Never concatenate codes. Empty if the rule is merchant-specific.',
    items: { type: "string" },
  },
  merchantSlugs: {
    type: "array",
    description:
      "Lowercase hyphenated names of specific merchants, e.g. ['chase-travel']. Empty for ordinary category rules.",
    items: { type: "string" },
  },
  rate: {
    type: "number",
    description:
      "Earn multiplier per dollar. Write 4 for '4x points' and also 4 for '4% cash back'. Never a percentage of a percentage.",
  },
  capAmountCents: {
    type: "integer",
    description:
      "Spend ceiling in cents before the rate drops to the base rate. Use 0 when the issuer states no cap. $6,000 is 600000.",
  },
  capPeriod: {
    type: "string",
    description: "How often the cap resets. Use 'none' when there is no cap.",
    enum: ["month", "quarter", "year", "none"],
  },
  requiresActivation: {
    type: "boolean",
    description: "True only for rotating categories you must opt into each quarter.",
  },
  selectionGroup: {
    type: "string",
    description:
      "Empty string normally. Set the same non-empty label on rules that are mutually exclusive because the cardholder picks one category.",
  },
  validFrom: { type: "string", description: "Empty string, or yyyy-mm-dd if the rule is time-limited." },
  validTo: { type: "string", description: "Empty string, or yyyy-mm-dd if the rule expires." },
  priority: { type: "integer", description: "0 normally. Use 10 or 20 to favour a rule when rates tie." },
  notes: { type: "string", description: "Exclusions and conditions worth surfacing, or an empty string." },
};

const EXTRACT_JSON_SCHEMA = strictObject({
  issuer: { type: "string", description: "Bank or issuer name, e.g. 'Chase'." },
  product: { type: "string", description: "Card name without the issuer, e.g. 'Sapphire Preferred'." },
  network: { type: "string", enum: ["visa", "mastercard", "amex", "discover"] },
  annualFeeCents: { type: "integer", description: "Annual fee in cents. $95 is 9500. Use 0 if none." },
  fxFeePct: { type: "number", description: "Foreign transaction fee percent. 3 means 3%. Use 0 if none." },
  baseRate: {
    type: "number",
    description: "Earn rate on purchases that match no bonus category. Usually 1, sometimes 1.5 or 2.",
  },
  currencyCode: {
    type: "string",
    description:
      "Short code for what the card earns: USD for cash back, UR for Chase Ultimate Rewards, MR for Amex Membership Rewards, TYP for Citi ThankYou, C1 for Capital One miles, otherwise a sensible abbreviation.",
  },
  currencyName: { type: "string", description: "Full name of the rewards currency." },
  currencyDefaultCpp: {
    type: "number",
    description: "Cents per point at a plain cash redemption. Exactly 1 for cash back cards.",
  },
  currencyIsCashback: { type: "boolean", description: "True when rewards are cash and cannot be transferred." },
  colorFrom: { type: "string", description: "Hex colour matching the card's design, e.g. '#1e3a5f'." },
  colorTo: { type: "string", description: "Darker hex colour for the bottom of the card gradient." },
  notes: { type: "string", description: "One sentence on credits or quirks worth remembering, or empty." },
  uncertainties: {
    type: "array",
    description: "Anything the source did not state clearly. Be honest here rather than guessing silently.",
    items: { type: "string" },
  },
  rules: {
    type: "array",
    description: "One entry per bonus category. Do not include the base rate as a rule.",
    items: strictObject(RULE_PROPERTIES),
  },
});

const EXTRACT_SYSTEM = `You read credit card rewards terms and turn them into structured earn rules for a rewards calculator.

You must always answer with the JSON object the schema requires. Never ask clarifying questions. Never reply in prose. Never refuse. If the source is thin, partial, or lists several cards, extract the single card named in the request using whatever facts are present, and put every gap in "uncertainties".

Accuracy matters more than completeness. Extract only what the text actually states. If a cap, date or exclusion is not stated, leave it at 0 or an empty string rather than guessing, and list the gap in "uncertainties".

Rules for the rate field: express everything as an earn multiplier per dollar. "3x points" is 3. "3% cash back" is also 3. "5 miles per dollar" is 5. Never convert between the two.

Do not create a rule for the card's ordinary everywhere-else rate. That belongs in baseRate.

Every rule must list at least one merchant category code in mccCodes, unless the bonus is tied to a named merchant instead, in which case use merchantSlugs. A rule with neither can never pay out. Map each bonus category to the codes it pays on, because the calculator matches on the code the merchant transmits. Each mccCodes entry must be a separate string of exactly four digits, for example ["5812","5814"]. Never write an integer, and never glue codes into one string.

${MCC_REFERENCE}

When a bonus applies only at a named place rather than a category, such as a bank's own travel portal, put a lowercase hyphenated merchant name in merchantSlugs and leave mccCodes empty.

Rotating quarterly categories set requiresActivation to true. Cards where the holder picks one bonus category should give every candidate rule the same selectionGroup.`;

/**
 * A Guide to Benefits PDF runs tens of thousands of words, almost none of it
 * about earn rates. Rather than truncating and losing the rewards table, keep
 * the paragraphs that actually talk about earning and drop the rest.
 */
const REWARD_SIGNALS = [
  /\d\s*[x×]\b/i,
  /\d+(\.\d+)?\s*%/,
  /\b(cash\s*back|points?|miles?)\b/i,
  /\bearn\b/i,
  /\bannual fee\b/i,
  /\bforeign transaction\b/i,
  /\bup to \$?[\d,]+/i,
  /\bper (calendar )?(year|quarter|month)\b/i,
  /\b(bonus|categor|rewards? rate|activat)/i,
];

export function condenseTerms(text: string, maxChars: number): { text: string; truncated: boolean } {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= maxChars) return { text: clean, truncated: false };

  const blocks = clean.split(/\n{2,}|(?<=\.)\n/).filter((b) => b.trim().length > 0);
  const scored = blocks.map((block, index) => ({
    block,
    index,
    score: REWARD_SIGNALS.reduce((sum, re) => sum + (re.test(block) ? 1 : 0), 0),
  }));

  const kept: typeof scored = [];
  let budget = maxChars;
  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (item.score === 0) continue;
    if (item.block.length > budget) continue;
    kept.push(item);
    budget -= item.block.length + 2;
  }

  if (kept.length === 0) return { text: clean.slice(0, maxChars), truncated: true };

  return {
    text: kept
      .sort((a, b) => a.index - b.index)
      .map((k) => k.block)
      .join("\n\n"),
    truncated: true,
  };
}

export async function extractCardFromText(
  text: string,
  sourceUrl: string,
  cardHint = "",
): Promise<ExtractedCard> {
  if (text.trim().length < 40) {
    throw new Error("That text is too short to read anything useful from.");
  }

  // Sized for Groq's free-tier budget of 8,000 tokens per minute, which covers
  // the prompt and the reserved completion together.
  const { text: condensed, truncated } = condenseTerms(text, 11_000);
  const target = cardHint.trim();
  const user = target
    ? `Extract earn rules for this exact card only: "${target}". Ignore other products mentioned in the source. Always return the JSON schema — never ask which card.\n\n${condensed}`
    : `Extract the card and its earn rules from these terms. Always return the JSON schema — never ask clarifying questions.\n\n${condensed}`;

  const raw = await structuredCompletion({
    model: MODEL_SMART,
    system: EXTRACT_SYSTEM,
    user,
    schemaName: "card_extraction",
    schema: EXTRACT_JSON_SCHEMA,
    validator: rawCardSchema,
    maxTokens: 3000,
  });

  const uncertainties = raw.uncertainties.filter((u) => u.trim().length > 0);
  if (truncated) {
    uncertainties.unshift(
      "The source was long, so only the passages about earning rewards were read. Check for categories that may have been missed.",
    );
  }

  const rules = raw.rules
    .filter((r) => r.label.trim().length > 0 && r.rate > 0)
    .map((r) => {
      // Already expanded by the Zod transform; keep the filter as a belt-and-braces check.
      const stated = r.mccCodes.filter((c) => c >= 700 && c <= 9999);
      const merchantSlugs = r.merchantSlugs.map((m) => slugify(m)).filter(Boolean);
      let mccCodes = stated;

      if (stated.length === 0 && merchantSlugs.length === 0) {
        mccCodes = inferMccCodes(r.label);
        uncertainties.push(
          mccCodes.length > 0
            ? `No category codes were given for "${r.label}", so they were inferred from the name. Check them.`
            : `"${r.label}" has no category codes, so it will never pay out until you add them.`,
        );
      }

      return {
        label: r.label.trim(),
        mccCodes,
        merchantSlugs,
        rate: r.rate,
        capAmountCents: r.capAmountCents > 0 ? r.capAmountCents : null,
        capPeriod: r.capAmountCents > 0 && r.capPeriod !== "none" ? r.capPeriod : ("none" as const),
        requiresActivation: r.requiresActivation,
        selectionGroup: r.selectionGroup.trim() ? slugify(r.selectionGroup) : null,
        validFrom: isIsoDate(r.validFrom) ? r.validFrom : null,
        validTo: isIsoDate(r.validTo) ? r.validTo : null,
        priority: r.priority,
        notes: r.notes,
      } satisfies ExtractedRule;
    });

  return {
    slug: slugify(`${raw.issuer} ${raw.product}`),
    issuer: raw.issuer,
    product: raw.product,
    network: raw.network,
    annualFeeCents: raw.annualFeeCents,
    fxFeePct: raw.fxFeePct,
    baseRate: raw.baseRate,
    currencyCode: raw.currencyCode.toUpperCase(),
    currencyName: raw.currencyName || raw.currencyCode,
    currencyDefaultCpp: raw.currencyIsCashback ? 1 : raw.currencyDefaultCpp || 1,
    currencyIsCashback: raw.currencyIsCashback,
    colorFrom: normalizeHex(raw.colorFrom, "#2b3547"),
    colorTo: normalizeHex(raw.colorTo, "#141b26"),
    notes: raw.notes,
    sourceUrl,
    sources: [],
    uncertainties,
    rules,
  };
}

/** Pulls the text layer out of a rewards PDF so it can be extracted like paste. */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  const text: string | string[] = result.text;
  return Array.isArray(text) ? text.join("\n") : text;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeHex(value: string, fallback: string): string {
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}
