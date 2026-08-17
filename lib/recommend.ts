import { desc, eq, inArray, and } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { rankWallet } from "@/lib/engine/score";
import type { CardScore, PurchaseContext } from "@/lib/engine/types";
import { mccLabel } from "@/lib/mcc";
import { resolveMerchant } from "@/lib/merchants";
import { loadWallet } from "@/lib/wallet";

export type RecommendInput = {
  query: string;
  amountCents: number;
  isForeign?: boolean;
  at?: Date;
};

export type RecommendResult = {
  merchant: {
    id: number;
    slug: string;
    name: string;
    mcc: number;
    mccLabel: string;
    category: string;
    codingNote: string | null;
    networkExclusions: string[];
    summary: string;
    highlight: string;
    sources: string[];
  };
  resolvedBy: "cache" | "ai";
  amountCents: number;
  isForeign: boolean;
  scores: CardScore[];
  /** Set when the ranking was computed in the browser from a cached snapshot. */
  offline?: boolean;
};

export async function recommend(
  db: Db,
  userId: number,
  input: RecommendInput,
): Promise<RecommendResult | null> {
  const at = input.at ?? new Date();
  const resolved = await resolveMerchant(db, input.query);
  if (!resolved) return null;

  const { merchant } = resolved;
  const wallet = await loadWallet(db, userId, at);

  const ctx: PurchaseContext = {
    mcc: merchant.mcc,
    merchantSlug: merchant.slug,
    merchantName: merchant.name,
    amountCents: input.amountCents,
    date: at,
    isForeign: input.isForeign ?? false,
    excludedNetworks: merchant.networkExclusions,
  };

  return {
    merchant: {
      id: merchant.id,
      slug: merchant.slug,
      name: merchant.name,
      mcc: merchant.mcc,
      mccLabel: mccLabel(merchant.mcc),
      category: merchant.category,
      codingNote: merchant.codingNote,
      networkExclusions: merchant.networkExclusions,
      summary: resolved.summary,
      highlight: resolved.highlight,
      sources: resolved.sources,
    },
    resolvedBy: resolved.source,
    amountCents: input.amountCents,
    isForeign: ctx.isForeign,
    scores: rankWallet(wallet, ctx),
  };
}

/** Merchants this user has actually paid at recently, newest first. */
export async function recentMerchants(db: Db, userId: number, limit = 6): Promise<s.Merchant[]> {
  const recent = await db
    .select({ merchantId: s.transactions.merchantId })
    .from(s.transactions)
    .innerJoin(s.userCards, eq(s.transactions.userCardId, s.userCards.id))
    .where(eq(s.userCards.userId, userId))
    .orderBy(desc(s.transactions.occurredAt))
    .limit(60);

  const ids: number[] = [];
  for (const row of recent) {
    if (row.merchantId !== null && !ids.includes(row.merchantId)) ids.push(row.merchantId);
    if (ids.length >= limit) break;
  }
  if (ids.length === 0) return [];

  const found = await db.select().from(s.merchants).where(inArray(s.merchants.id, ids));
  return ids.map((id) => found.find((m) => m.id === id)!).filter(Boolean);
}

/** Shown before you've logged anything, so the home screen is never empty. */
export async function starterMerchants(db: Db): Promise<s.Merchant[]> {
  const slugs = ["mcdonalds", "whole-foods", "shell", "costco", "amazon", "delta"];
  const found = await db.select().from(s.merchants).where(inArray(s.merchants.slug, slugs));
  return slugs.map((slug) => found.find((m) => m.slug === slug)!).filter(Boolean);
}

export async function countWallet(db: Db, userId: number): Promise<number> {
  const rows = await db
    .select({ id: s.userCards.id })
    .from(s.userCards)
    .where(and(eq(s.userCards.active, true), eq(s.userCards.userId, userId)));
  return rows.length;
}
