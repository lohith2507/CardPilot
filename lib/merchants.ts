import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { MODEL_FAST, strictObject, structuredCompletion } from "@/lib/groq";
import { MCC_REFERENCE, mccLabel } from "@/lib/mcc";
import {
  buildMerchantBlurb,
  buildResolutionUser,
  searchMerchantWeb,
  type MerchantWebFacts,
} from "@/lib/merchant-lookup";
import { bestMatch, CONFIDENT_MATCH, displayMerchantName, isPlausibleAlias, matchScore, normalizeQuery } from "@/lib/merchant-match";
import { isNvidiaConfigured, nvidiaJsonCompletion } from "@/lib/nvidia";

export { normalizeQuery, matchScore };

function canonical(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function searchMerchants(db: Db, query: string, limit = 8): Promise<s.Merchant[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const all = await db.select().from(s.merchants);
  return all
    .map((m) => ({ m, score: matchScore(m, normalized) }))
    .filter((x) => x.score > 20)
    .sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map((x) => x.m);
}

const resolutionSchema = z.object({
  canonicalName: z.string().min(1),
  mcc: z.number().int().min(700).max(9999),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  networkExclusions: z.array(z.enum(["visa", "mastercard", "amex", "discover"])),
  codingNote: z.string(),
});

type Resolution = z.infer<typeof resolutionSchema>;

const RESOLUTION_JSON_SCHEMA = strictObject({
  canonicalName: { type: "string", description: "The merchant's common brand name." },
  mcc: {
    type: "integer",
    description: "The four-digit merchant category code this merchant transmits to card networks.",
  },
  category: { type: "string", description: "Short human label, e.g. 'Fast food' or 'Grocery'." },
  confidence: { type: "number", description: "0 to 1. Below 0.5 if you are guessing." },
  networkExclusions: {
    type: "array",
    description: "Card networks this merchant refuses. Empty for almost every merchant.",
    items: { type: "string", enum: ["visa", "mastercard", "amex", "discover"] },
  },
  codingNote: {
    type: "string",
    description:
      "Empty string unless this merchant codes counterintuitively, in which case one sentence explaining it.",
  },
});

const RESOLUTION_SYSTEM = `You map merchants to the merchant category code (MCC) they actually transmit to card networks.

Use the web findings when they identify the business. A local Indian grocery named Mayuri is groceries (5411), not a restaurant, even if the name is unfamiliar.

This matters because credit card bonus categories match on the transmitted MCC, not on what the business appears to be. Be precise.

${MCC_REFERENCE}

Known traps to honour:
- Warehouse-club fuel pumps code as 5542, not 5300.
- Target and Walmart Supercenters code as discount stores (5310), never as grocery.
- Food delivery apps code as restaurants, not as transport.
- Amazon codes as general merchandise, not grocery.
- Ethnic / independent grocers (Indian, Korean, Mexican markets) usually code as 5411 grocery, not restaurants.
- Keep canonicalName close to what the user typed. Do not replace "Swagath" or "Mayuri" with a famous brand that merely shares letters (not Southwest, not a truncated "May").

Set networkExclusions only where a merchant genuinely refuses a network. Leave codingNote empty unless the coding would surprise someone, or the web evidence is thin.`;

export type ResolvedMerchant = {
  merchant: s.Merchant;
  source: "cache" | "ai";
  confidence: number;
  summary: string;
  highlight: string;
  sources: string[];
};

/**
 * Checks the local merchant table first so repeat lookups are instant and free,
 * then searches the web for unknown names and maps that to an MCC. Groq does
 * the web search; NVIDIA (when configured) turns snippets into JSON so the two
 * calls can run on different providers.
 */
export async function resolveMerchant(db: Db, query: string): Promise<ResolvedMerchant | null> {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const all = await db.select().from(s.merchants);
  const best = bestMatch(all, normalized);

  if (
    best &&
    best.score >= CONFIDENT_MATCH &&
    isPlausibleAlias(normalized, best.merchant.name)
  ) {
    const blurb = buildMerchantBlurb(
      best.merchant.name,
      best.merchant.category,
      best.merchant.mcc,
      mccLabel(best.merchant.mcc),
    );
    return {
      merchant: best.merchant,
      source: "cache",
      confidence: 1,
      summary: blurb.summary,
      highlight: blurb.highlight,
      sources: blurb.sources,
    };
  }

  let facts: MerchantWebFacts = { text: "", sources: [] };
  try {
    facts = await searchMerchantWeb(normalized);
  } catch {
    facts = { text: "", sources: [] };
  }

  const resolved = await resolveFromFacts(normalized, facts);
  if (!isPlausibleAlias(normalized, resolved.canonicalName)) {
    resolved.canonicalName = displayMerchantName(normalized);
  }
  return persistResolution(db, normalized, resolved, all, facts);
}

async function resolveFromFacts(query: string, facts: MerchantWebFacts): Promise<Resolution> {
  const user = buildResolutionUser(query, facts);

  if (isNvidiaConfigured()) {
    try {
      const raw = await nvidiaJsonCompletion({
        system: `${RESOLUTION_SYSTEM}\nReply with a single JSON object matching the fields: canonicalName, mcc, category, confidence, networkExclusions, codingNote.`,
        user,
      });
      return resolutionSchema.parse(raw);
    } catch {
      // Groq constrained decoding is the fallback.
    }
  }

  return structuredCompletion({
    model: MODEL_FAST,
    system: RESOLUTION_SYSTEM,
    user,
    schemaName: "merchant_resolution",
    schema: RESOLUTION_JSON_SCHEMA,
    validator: resolutionSchema,
    maxTokens: 900,
  });
}

async function persistResolution(
  db: Db,
  typed: string,
  resolved: Resolution,
  existing: s.Merchant[],
  facts: MerchantWebFacts,
): Promise<ResolvedMerchant> {
  const alias = canonical(typed);
  const nameKey = canonical(resolved.canonicalName);
  const match = existing.find(
    (m) =>
      isPlausibleAlias(resolved.canonicalName, m.name) &&
      (canonical(m.name) === nameKey || matchScore(m, resolved.canonicalName) >= CONFIDENT_MATCH),
  );

  const note = resolved.codingNote.trim() || defaultLookupNote(resolved.confidence);

  if (match && isPlausibleAlias(typed, match.name)) {
    const aliases = new Set(match.aliases.map(canonical));
    if (alias && alias !== canonical(match.name) && !aliases.has(alias)) {
      const nextAliases = [...match.aliases, typed];
      const [updated] = await db
        .update(s.merchants)
        .set({
          aliases: nextAliases,
          codingNote: match.codingNote ?? note,
        })
        .where(eq(s.merchants.id, match.id))
        .returning();
      const blurb = buildMerchantBlurb(
        updated.name,
        updated.category,
        updated.mcc,
        mccLabel(updated.mcc),
        facts,
      );
      return {
        merchant: updated,
        source: "ai",
        confidence: resolved.confidence,
        summary: blurb.summary,
        highlight: blurb.highlight,
        sources: blurb.sources,
      };
    }
    const cachedBlurb = buildMerchantBlurb(
      match.name,
      match.category,
      match.mcc,
      mccLabel(match.mcc),
      facts,
    );
    return {
      merchant: match,
      source: "cache",
      confidence: resolved.confidence,
      summary: cachedBlurb.summary,
      highlight: cachedBlurb.highlight,
      sources: cachedBlurb.sources,
    };
  }

  const slug = await uniqueSlug(db, resolved.canonicalName);
  const category = resolved.category || mccLabel(resolved.mcc);
  const [inserted] = await db
    .insert(s.merchants)
    .values({
      slug,
      name: resolved.canonicalName,
      aliases: alias === nameKey ? [] : [typed],
      mcc: resolved.mcc,
      category,
      networkExclusions: resolved.networkExclusions,
      issuerOverrides: {},
      source: "llm",
      codingNote: note,
    })
    .returning();

  const blurb = buildMerchantBlurb(inserted.name, category, inserted.mcc, mccLabel(inserted.mcc), facts);
  return {
    merchant: inserted,
    source: "ai",
    confidence: resolved.confidence,
    summary: blurb.summary,
    highlight: blurb.highlight,
    sources: blurb.sources,
  };
}

export function defaultLookupNote(confidence: number): string | null {
  if (confidence >= 0.75) return null;
  return "Category estimated from a web lookup of the name. Confirm how the purchase usually codes.";
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "merchant"
  );
}

async function uniqueSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await db
      .select({ id: s.merchants.id })
      .from(s.merchants)
      .where(eq(s.merchants.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}
