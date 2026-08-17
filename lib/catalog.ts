import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { periodBounds } from "@/lib/engine/period";
import type { CapPeriod } from "@/lib/engine/types";

export type CatalogEntry = {
  card: s.Card;
  currency: s.PointCurrency;
  rules: s.EarnRule[];
  userCardId: number | null;
  inWallet: boolean;
  activations: Record<string, boolean>;
  selections: Record<string, number>;
  /** { [ruleId]: cents spent in the rule's current cap window }. */
  capUsedCents: Record<number, number>;
  sub: s.SubProgress | null;
};

/** Every card the app knows about, annotated with whether you carry it. */
export async function loadCatalog(db: Db, at: Date = new Date()): Promise<CatalogEntry[]> {
  const [cardRows, currencies, rules, userCardRows, subs] = await Promise.all([
    db.select().from(s.cards).orderBy(asc(s.cards.issuer), asc(s.cards.product)),
    db.select().from(s.pointCurrencies),
    db.select().from(s.earnRules).orderBy(asc(s.earnRules.id)),
    db.select().from(s.userCards),
    db.select().from(s.subProgress),
  ]);

  const activeUserCardIds = userCardRows.filter((u) => u.active).map((u) => u.id);
  const ledger =
    activeUserCardIds.length > 0
      ? await db
          .select({
            userCardId: s.transactions.userCardId,
            earnRuleId: s.transactions.earnRuleId,
            amountCents: s.transactions.amountCents,
            occurredAt: s.transactions.occurredAt,
          })
          .from(s.transactions)
          .where(inArray(s.transactions.userCardId, activeUserCardIds))
      : [];

  const currencyById = new Map(currencies.map((c) => [c.id, c]));
  const userCardByCardId = new Map(userCardRows.map((u) => [u.cardId, u]));
  const subByUserCardId = new Map(subs.map((x) => [x.userCardId, x]));

  return cardRows.map((card) => {
    const cardRules = rules.filter((r) => r.cardId === card.id);
    const userCard = userCardByCardId.get(card.id) ?? null;
    const txns = userCard ? ledger.filter((t) => t.userCardId === userCard.id) : [];

    const capUsedCents: Record<number, number> = {};
    for (const rule of cardRules) {
      if (rule.capAmountCents === null || rule.capPeriod === "none") continue;
      const bounds = periodBounds(rule.capPeriod as CapPeriod, at);
      if (!bounds) continue;
      capUsedCents[rule.id] = txns
        .filter(
          (t) =>
            t.earnRuleId === rule.id && t.occurredAt >= bounds.start && t.occurredAt < bounds.end,
        )
        .reduce((sum, t) => sum + t.amountCents, 0);
    }

    return {
      card,
      currency: currencyById.get(card.currencyId)!,
      rules: cardRules,
      userCardId: userCard?.id ?? null,
      inWallet: Boolean(userCard?.active),
      activations: (userCard?.activations ?? {}) as Record<string, boolean>,
      selections: (userCard?.selections ?? {}) as Record<string, number>,
      capUsedCents,
      sub: userCard ? (subByUserCardId.get(userCard.id) ?? null) : null,
    };
  });
}

export async function loadTransactions(db: Db, limit = 30) {
  return db
    .select({
      id: s.transactions.id,
      merchantName: s.transactions.merchantName,
      mcc: s.transactions.mcc,
      amountCents: s.transactions.amountCents,
      occurredAt: s.transactions.occurredAt,
      product: s.cards.product,
      issuer: s.cards.issuer,
      colorFrom: s.cards.colorFrom,
      colorTo: s.cards.colorTo,
    })
    .from(s.transactions)
    .innerJoin(s.userCards, eq(s.transactions.userCardId, s.userCards.id))
    .innerJoin(s.cards, eq(s.userCards.cardId, s.cards.id))
    .orderBy(s.transactions.occurredAt)
    .limit(limit);
}
