import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { rankWallet } from "@/lib/engine/score";
import type { CardScore, PurchaseContext } from "@/lib/engine/types";
import { listFavoriteMerchants } from "@/lib/favorites";
import { mccLabel } from "@/lib/mcc";
import { resolveMerchant } from "@/lib/merchants";
import { loadWallet } from "@/lib/wallet";

export type RecommendLine = {
  label: string;
  amountCents: number;
  /** Override MCC for this line; defaults to the resolved merchant MCC. */
  mcc?: number;
};

export type RecommendInput = {
  query: string;
  amountCents: number;
  isForeign?: boolean;
  at?: Date;
  /** Optional split: grocery + general etc. Sum should match amountCents. */
  lines?: RecommendLine[];
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
    favorite: boolean;
  };
  resolvedBy: "cache" | "ai";
  amountCents: number;
  isForeign: boolean;
  scores: CardScore[];
  lineResults?: {
    label: string;
    amountCents: number;
    mcc: number;
    mccLabel: string;
    scores: CardScore[];
  }[];
  /** Set when the ranking was computed in the browser from a cached snapshot. */
  offline?: boolean;
};

export type PendingActivation = {
  userCardId: number;
  ruleId: number;
  product: string;
  issuer: string;
  label: string;
  validFrom: string | null;
  validTo: string | null;
};

export async function recommend(
  db: Db,
  userId: number,
  input: RecommendInput,
): Promise<RecommendResult | null> {
  const at = input.at ?? new Date();
  const walletPromise = loadWallet(db, userId, at);
  const resolved = await resolveMerchant(db, input.query);
  if (!resolved) return null;

  const { merchant } = resolved;
  const wallet = await walletPromise;
  const favorite = await isFavoriteForUser(db, userId, merchant.id);

  const isForeign = input.isForeign ?? false;
  const baseMerchant = {
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
    favorite,
  };

  const lines = (input.lines ?? []).filter((l) => l.amountCents > 0);
  if (lines.length >= 2) {
    const lineResults = lines.map((line) => {
      const mcc = line.mcc ?? merchant.mcc;
      const ctx: PurchaseContext = {
        mcc,
        merchantSlug: merchant.slug,
        merchantName: merchant.name,
        amountCents: line.amountCents,
        date: at,
        isForeign,
        excludedNetworks: merchant.networkExclusions,
      };
      return {
        label: line.label.trim() || mccLabel(mcc),
        amountCents: line.amountCents,
        mcc,
        mccLabel: mccLabel(mcc),
        scores: rankWallet(wallet, ctx),
      };
    });
    const totalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
    const combined = combineLineScores(lineResults);
    return {
      merchant: baseMerchant,
      resolvedBy: resolved.source,
      amountCents: totalCents || input.amountCents,
      isForeign,
      scores: combined,
      lineResults,
    };
  }

  const ctx: PurchaseContext = {
    mcc: merchant.mcc,
    merchantSlug: merchant.slug,
    merchantName: merchant.name,
    amountCents: input.amountCents,
    date: at,
    isForeign,
    excludedNetworks: merchant.networkExclusions,
  };

  return {
    merchant: baseMerchant,
    resolvedBy: resolved.source,
    amountCents: input.amountCents,
    isForeign,
    scores: rankWallet(wallet, ctx),
  };
}

function combineLineScores(
  lineResults: NonNullable<RecommendResult["lineResults"]>,
): CardScore[] {
  const byUserCard = new Map<number, CardScore>();
  for (const line of lineResults) {
    for (const score of line.scores) {
      const prev = byUserCard.get(score.userCardId);
      if (!prev) {
        byUserCard.set(score.userCardId, {
          ...score,
          reasons: [
            { label: `${line.label} · ${score.appliedRule?.label ?? "Base rate"}`, value: formatLineValue(score) },
            ...score.reasons,
          ],
        });
        continue;
      }
      const totalValueCents = prev.totalValueCents + score.totalValueCents;
      const earnValueCents = prev.earnValueCents + score.earnValueCents;
      const fxFeeCents = prev.fxFeeCents + score.fxFeeCents;
      const pointsEarned = prev.pointsEarned + score.pointsEarned;
      const amount = lineResults.reduce((s, l) => s + l.amountCents, 0) || 1;
      byUserCard.set(score.userCardId, {
        ...prev,
        eligible: prev.eligible && score.eligible,
        ineligibleReason: prev.eligible ? score.ineligibleReason : prev.ineligibleReason,
        totalValueCents,
        earnValueCents,
        fxFeeCents,
        pointsEarned,
        signupBonusValueCents: prev.signupBonusValueCents + score.signupBonusValueCents,
        effectiveRatePct: (totalValueCents / amount) * 100,
        reasons: [
          ...prev.reasons,
          {
            label: `${line.label} · ${score.appliedRule?.label ?? "Base rate"}`,
            value: formatLineValue(score),
          },
        ],
        warnings: [...new Set([...prev.warnings, ...score.warnings])],
      });
    }
  }
  return [...byUserCard.values()].sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.totalValueCents - a.totalValueCents ||
      a.card.annualFeeCents - b.card.annualFeeCents,
  );
}

function formatLineValue(score: CardScore): string {
  const dollars = (score.totalValueCents / 100).toFixed(2);
  return `$${dollars}`;
}

async function isFavoriteForUser(db: Db, userId: number, merchantId: number): Promise<boolean> {
  const favs = await listFavoriteMerchants(db, userId);
  return favs.some((m) => m.id === merchantId);
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

export async function pendingActivations(db: Db, userId: number): Promise<PendingActivation[]> {
  const wallet = await loadWallet(db, userId);
  const today = new Date().toISOString().slice(0, 10);
  const out: PendingActivation[] = [];
  for (const entry of wallet) {
    for (const rule of entry.rules) {
      if (!rule.requiresActivation) continue;
      if (entry.activations[String(rule.id)] === true) continue;
      if (rule.validFrom && today < rule.validFrom) continue;
      if (rule.validTo && today > rule.validTo) continue;
      out.push({
        userCardId: entry.userCardId,
        ruleId: rule.id,
        product: entry.card.product,
        issuer: entry.card.issuer,
        label: rule.label,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
      });
    }
  }
  return out;
}

export async function loadTripPrefs(
  db: Db,
  userId: number,
): Promise<{ tripMode: boolean; tripAbroadDefault: boolean; householdCode: string | null }> {
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
  return {
    tripMode: user?.tripMode ?? false,
    tripAbroadDefault: user?.tripAbroadDefault ?? true,
    householdCode: user?.householdCode ?? null,
  };
}
