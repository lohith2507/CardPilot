import { and, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { periodBounds } from "@/lib/engine/period";
import { loadWallet } from "@/lib/wallet";

export type FeeYearSummary = {
  userCardId: number;
  cardId: number;
  product: string;
  issuer: string;
  annualFeeCents: number;
  /** Rough cash value of logged earn this calendar year. */
  estimatedRewardsCents: number;
  loggedSpendCents: number;
  /** estimatedRewardsCents minus annualFeeCents; negative means the fee is not yet earned back. */
  netVsFeeCents: number;
};

/**
 * Calendar-year (UTC, Jan 1 to now) estimate per wallet card: each logged
 * transaction earns its tagged rule's rate (else the card's base rate) times the
 * user's CPP override, falling back to the currency's default CPP.
 */
export async function feeVsRewardsYtd(db: Db, userId: number, at = new Date()): Promise<FeeYearSummary[]> {
  const wallet = await loadWallet(db, userId, at);
  if (!wallet.length) return [];

  const yearStart = periodBounds("year", at)!.start;
  const userCardIds = wallet.map((w) => w.userCardId);
  const ledger = await db
    .select({
      userCardId: s.transactions.userCardId,
      earnRuleId: s.transactions.earnRuleId,
      amountCents: s.transactions.amountCents,
    })
    .from(s.transactions)
    .where(
      and(inArray(s.transactions.userCardId, userCardIds), gte(s.transactions.occurredAt, yearStart)),
    );

  return wallet.map((entry) => {
    const txns = ledger.filter((t) => t.userCardId === entry.userCardId);
    const cpp = entry.currency.userCpp ?? entry.currency.defaultCpp;
    let estimatedRewardsCents = 0;
    let loggedSpendCents = 0;
    for (const t of txns) {
      loggedSpendCents += t.amountCents;
      const rule = entry.rules.find((r) => r.id === t.earnRuleId);
      const rate = rule?.rate ?? entry.card.baseRate;
      const dollars = t.amountCents / 100;
      estimatedRewardsCents += Math.round(dollars * rate * cpp);
    }
    return {
      userCardId: entry.userCardId,
      cardId: entry.card.id,
      product: entry.card.product,
      issuer: entry.card.issuer,
      annualFeeCents: entry.card.annualFeeCents,
      estimatedRewardsCents,
      loggedSpendCents,
      netVsFeeCents: estimatedRewardsCents - entry.card.annualFeeCents,
    };
  });
}
