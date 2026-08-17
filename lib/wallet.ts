import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { periodBounds } from "@/lib/engine/period";
import type { CapPeriod, EngineRule, WalletEntry } from "@/lib/engine/types";

/**
 * Loads every card you hold along with enough ledger history to know how much
 * of each bonus cap is already spent. Cap windows are at most a calendar year,
 * so pulling this year's transactions is sufficient and keeps it to one query.
 */
export async function loadWallet(
  db: Db,
  userId: number,
  at: Date = new Date(),
): Promise<WalletEntry[]> {
  const rows = await db
    .select({
      userCard: s.userCards,
      card: s.cards,
      currency: s.pointCurrencies,
      valuation: s.userCurrencyValuations,
    })
    .from(s.userCards)
    .innerJoin(s.cards, eq(s.userCards.cardId, s.cards.id))
    .innerJoin(s.pointCurrencies, eq(s.cards.currencyId, s.pointCurrencies.id))
    .leftJoin(
      s.userCurrencyValuations,
      and(
        eq(s.userCurrencyValuations.currencyId, s.pointCurrencies.id),
        eq(s.userCurrencyValuations.userId, userId),
      ),
    )
    .where(and(eq(s.userCards.active, true), eq(s.userCards.userId, userId)));

  if (rows.length === 0) return [];

  const cardIds = rows.map((r) => r.card.id);
  const userCardIds = rows.map((r) => r.userCard.id);

  const [rules, subs, ledger] = await Promise.all([
    db.select().from(s.earnRules).where(inArray(s.earnRules.cardId, cardIds)),
    db.select().from(s.subProgress).where(inArray(s.subProgress.userCardId, userCardIds)),
    db
      .select({
        userCardId: s.transactions.userCardId,
        earnRuleId: s.transactions.earnRuleId,
        amountCents: s.transactions.amountCents,
        occurredAt: s.transactions.occurredAt,
      })
      .from(s.transactions)
      .where(
        and(
          inArray(s.transactions.userCardId, userCardIds),
          gte(s.transactions.occurredAt, periodBounds("year", at)!.start),
        ),
      ),
  ]);

  const rulesByCard = groupBy(rules, (r) => r.cardId);
  const subByUserCard = new Map(subs.map((x) => [x.userCardId, x]));
  const ledgerByUserCard = groupBy(ledger, (t) => t.userCardId);

  return rows.map(({ userCard, card, currency, valuation }) => {
    const cardRules = (rulesByCard.get(card.id) ?? []).map(toEngineRule);
    const txns = ledgerByUserCard.get(userCard.id) ?? [];

    const capUsedCents: Record<number, number> = {};
    for (const rule of cardRules) {
      if (rule.capAmountCents === null || rule.capPeriod === "none") continue;
      const bounds = periodBounds(rule.capPeriod, at);
      if (!bounds) continue;
      capUsedCents[rule.id] = txns
        .filter(
          (t) =>
            t.earnRuleId === rule.id && t.occurredAt >= bounds.start && t.occurredAt < bounds.end,
        )
        .reduce((sum, t) => sum + t.amountCents, 0);
    }

    const subRow = subByUserCard.get(userCard.id);
    const sub = subRow
      ? {
          requiredSpendCents: subRow.requiredSpendCents,
          bonusValueCents: subRow.bonusValueCents,
          startedAt: subRow.startedAt,
          deadline: subRow.deadline,
          spentCents:
            subRow.preloggedSpendCents +
            txns
              .filter((t) => t.occurredAt >= new Date(`${subRow.startedAt}T00:00:00Z`))
              .reduce((sum, t) => sum + t.amountCents, 0),
        }
      : null;

    return {
      userCardId: userCard.id,
      card: {
        id: card.id,
        slug: card.slug,
        issuer: card.issuer,
        product: card.product,
        network: card.network,
        annualFeeCents: card.annualFeeCents,
        fxFeePct: card.fxFeePct,
        baseRate: card.baseRate,
        colorFrom: card.colorFrom,
        colorTo: card.colorTo,
        notes: card.notes,
      },
      currency: {
        code: currency.code,
        name: currency.name,
        defaultCpp: currency.defaultCpp,
        userCpp: valuation?.cpp ?? null,
        isCashback: currency.isCashback,
      },
      rules: cardRules,
      activations: (userCard.activations ?? {}) as Record<string, boolean>,
      selections: (userCard.selections ?? {}) as Record<string, number>,
      sub,
      capUsedCents,
    } satisfies WalletEntry;
  });
}

export function toEngineRule(r: s.EarnRule): EngineRule {
  return {
    id: r.id,
    label: r.label,
    mccCodes: r.mccCodes,
    merchantSlugs: r.merchantSlugs,
    rate: r.rate,
    capAmountCents: r.capAmountCents,
    capPeriod: r.capPeriod as CapPeriod,
    requiresActivation: r.requiresActivation,
    selectionGroup: r.selectionGroup,
    validFrom: r.validFrom,
    validTo: r.validTo,
    priority: r.priority,
    notes: r.notes,
    verifiedAt: r.verifiedAt,
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
