import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { MODEL_FAST, strictObject, structuredCompletion } from "@/lib/groq";
import { MCC_REFERENCE, mccLabel } from "@/lib/mcc";
import { bestMatch, CONFIDENT_MATCH, matchScore, normalizeQuery } from "@/lib/merchant-match";

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

const RESOLUTION_SYSTEM = `You map US merchants to the merchant category code (MCC) they actually transmit to card networks.

This matters because credit card bonus categories match on the transmitted MCC, not on what the business appears to be. Be precise and use the code the merchant genuinely uses.

${MCC_REFERENCE}

Known traps to honour:
- Warehouse-club fuel pumps code as 5542, not 5300.
- Target and Walmart Supercenters code as discount stores (5310), never as grocery.
- Food delivery apps code as restaurants, not as transport.
- Amazon codes as general merchandise, not grocery.

Set networkExclusions only where a merchant genuinely refuses a network, such as Costco US warehouses being Visa-only. Leave it empty otherwise. Leave codingNote empty unless the coding would surprise someone.`;

export type ResolvedMerchant = {
  merchant: s.Merchant;
  source: "cache" | "ai";
  confidence: number;
};

/**
 * Checks the local merchant table first so repeat lookups are instant and free,
 * and only falls back to the model for names it has never seen. Anything the
 * model resolves is written back, so each merchant costs one call ever.
 */
export async function resolveMerchant(db: Db, query: string): Promise<ResolvedMerchant | null> {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const all = await db.select().from(s.merchants);
  const best = bestMatch(all, normalized);

  if (best && best.score >= CONFIDENT_MATCH) {
    return { merchant: best.merchant, source: "cache", confidence: 1 };
  }

  const resolved = await structuredCompletion({
    model: MODEL_FAST,
    system: RESOLUTION_SYSTEM,
    user: `Merchant: ${normalized}`,
    schemaName: "merchant_resolution",
    schema: RESOLUTION_JSON_SCHEMA,
    validator: resolutionSchema,
    maxTokens: 900,
  });

  const slug = await uniqueSlug(db, resolved.canonicalName);
  const [inserted] = await db
    .insert(s.merchants)
    .values({
      slug,
      name: resolved.canonicalName,
      aliases: normalized === canonical(resolved.canonicalName) ? [] : [normalized],
      mcc: resolved.mcc,
      category: resolved.category || mccLabel(resolved.mcc),
      networkExclusions: resolved.networkExclusions,
      issuerOverrides: {},
      source: "llm",
      codingNote: resolved.codingNote.trim() || null,
    })
    .returning();

  return { merchant: inserted, source: "ai", confidence: resolved.confidence };
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
