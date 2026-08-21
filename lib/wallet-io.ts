import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { listFavoriteMerchants } from "@/lib/favorites";

export type WalletBackup = {
  version: 1;
  exportedAt: string;
  householdCode: string | null;
  tripMode: boolean;
  tripAbroadDefault: boolean;
  valuations: { currencyCode: string; cpp: number }[];
  cards: {
    slug: string;
    nickname: string | null;
    statementDay: number | null;
    openedAt: string | null;
    activations: Record<string, boolean>;
    selections: Record<string, number>;
    /** Rule labels that were activated — remapped by label on import when ids differ. */
    activationLabels: string[];
    selectionLabels: Record<string, string>;
  }[];
  favoriteMerchantSlugs: string[];
  transactions?: {
    cardSlug: string;
    merchantName: string;
    mcc: number;
    amountCents: number;
    occurredAt: string;
    ruleLabel: string | null;
  }[];
};

export async function exportWalletBackup(
  db: Db,
  userId: number,
  includeTransactions = true,
): Promise<WalletBackup> {
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
  const userCards = await db
    .select({
      userCard: s.userCards,
      card: s.cards,
    })
    .from(s.userCards)
    .innerJoin(s.cards, eq(s.userCards.cardId, s.cards.id))
    .where(and(eq(s.userCards.userId, userId), eq(s.userCards.active, true)));

  const cardIds = userCards.map((r) => r.card.id);
  const rules =
    cardIds.length > 0
      ? await db.select().from(s.earnRules).where(inArray(s.earnRules.cardId, cardIds))
      : [];
  const rulesByCard = new Map<number, s.EarnRule[]>();
  for (const rule of rules) {
    const bucket = rulesByCard.get(rule.cardId) ?? [];
    bucket.push(rule);
    rulesByCard.set(rule.cardId, bucket);
  }

  const valuations = await db
    .select({
      code: s.pointCurrencies.code,
      cpp: s.userCurrencyValuations.cpp,
    })
    .from(s.userCurrencyValuations)
    .innerJoin(s.pointCurrencies, eq(s.userCurrencyValuations.currencyId, s.pointCurrencies.id))
    .where(eq(s.userCurrencyValuations.userId, userId));

  const favorites = await listFavoriteMerchants(db, userId);

  const cards = userCards.map(({ userCard, card }) => {
    const cardRules = rulesByCard.get(card.id) ?? [];
    const activations = (userCard.activations ?? {}) as Record<string, boolean>;
    const selections = (userCard.selections ?? {}) as Record<string, number>;
    const activationLabels = cardRules
      .filter((r) => activations[String(r.id)])
      .map((r) => r.label);
    const selectionLabels: Record<string, string> = {};
    for (const [group, ruleId] of Object.entries(selections)) {
      const rule = cardRules.find((r) => r.id === ruleId);
      if (rule) selectionLabels[group] = rule.label;
    }
    return {
      slug: card.slug,
      nickname: userCard.nickname,
      statementDay: userCard.statementDay,
      openedAt: userCard.openedAt,
      activations,
      selections,
      activationLabels,
      selectionLabels,
    };
  });

  let transactions: WalletBackup["transactions"];
  if (includeTransactions && userCards.length) {
    const userCardIds = userCards.map((r) => r.userCard.id);
    const slugByUserCard = new Map(userCards.map((r) => [r.userCard.id, r.card.slug]));
    const labelByRule = new Map(rules.map((r) => [r.id, r.label]));
    const rows = await db
      .select()
      .from(s.transactions)
      .where(inArray(s.transactions.userCardId, userCardIds));
    transactions = rows.map((t) => ({
      cardSlug: slugByUserCard.get(t.userCardId) ?? "",
      merchantName: t.merchantName,
      mcc: t.mcc,
      amountCents: t.amountCents,
      occurredAt: t.occurredAt.toISOString(),
      ruleLabel: t.earnRuleId ? labelByRule.get(t.earnRuleId) ?? null : null,
    }));
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    householdCode: user?.householdCode ?? null,
    tripMode: user?.tripMode ?? false,
    tripAbroadDefault: user?.tripAbroadDefault ?? true,
    valuations: valuations.map((v) => ({ currencyCode: v.code, cpp: v.cpp })),
    cards,
    favoriteMerchantSlugs: favorites.map((m) => m.slug),
    transactions,
  };
}

export async function importWalletBackup(db: Db, userId: number, backup: WalletBackup): Promise<string> {
  if (backup.version !== 1) throw new Error("Unsupported backup version.");

  await db
    .update(s.users)
    .set({
      householdCode: backup.householdCode,
      tripMode: backup.tripMode,
      tripAbroadDefault: backup.tripAbroadDefault,
      updatedAt: new Date(),
    })
    .where(eq(s.users.id, userId));

  for (const v of backup.valuations) {
    const [currency] = await db
      .select()
      .from(s.pointCurrencies)
      .where(eq(s.pointCurrencies.code, v.currencyCode))
      .limit(1);
    if (!currency) continue;
    const existing = await db
      .select()
      .from(s.userCurrencyValuations)
      .where(
        and(
          eq(s.userCurrencyValuations.userId, userId),
          eq(s.userCurrencyValuations.currencyId, currency.id),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await db
        .update(s.userCurrencyValuations)
        .set({ cpp: v.cpp })
        .where(eq(s.userCurrencyValuations.id, existing[0].id));
    } else {
      await db.insert(s.userCurrencyValuations).values({
        userId,
        currencyId: currency.id,
        cpp: v.cpp,
      });
    }
  }

  let added = 0;
  for (const cardBackup of backup.cards) {
    const [card] = await db.select().from(s.cards).where(eq(s.cards.slug, cardBackup.slug)).limit(1);
    if (!card) continue;
    const rules = await db.select().from(s.earnRules).where(eq(s.earnRules.cardId, card.id));
    const activations: Record<string, boolean> = {};
    for (const label of cardBackup.activationLabels) {
      const rule = rules.find((r) => r.label === label);
      if (rule) activations[String(rule.id)] = true;
    }
    const selections: Record<string, number> = {};
    for (const [group, label] of Object.entries(cardBackup.selectionLabels)) {
      const rule = rules.find((r) => r.label === label);
      if (rule) selections[group] = rule.id;
    }

    const existing = await db
      .select()
      .from(s.userCards)
      .where(and(eq(s.userCards.userId, userId), eq(s.userCards.cardId, card.id)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(s.userCards)
        .set({
          active: true,
          nickname: cardBackup.nickname,
          statementDay: cardBackup.statementDay,
          openedAt: cardBackup.openedAt,
          activations,
          selections,
        })
        .where(eq(s.userCards.id, existing[0].id));
    } else {
      await db.insert(s.userCards).values({
        userId,
        cardId: card.id,
        nickname: cardBackup.nickname,
        statementDay: cardBackup.statementDay,
        openedAt: cardBackup.openedAt,
        activations,
        selections,
      });
      added += 1;
    }
  }

  for (const slug of backup.favoriteMerchantSlugs) {
    const [merchant] = await db.select().from(s.merchants).where(eq(s.merchants.slug, slug)).limit(1);
    if (!merchant) continue;
    const existing = await db
      .select()
      .from(s.userMerchantFavorites)
      .where(
        and(
          eq(s.userMerchantFavorites.userId, userId),
          eq(s.userMerchantFavorites.merchantId, merchant.id),
        ),
      )
      .limit(1);
    if (!existing[0]) {
      await db.insert(s.userMerchantFavorites).values({ userId, merchantId: merchant.id });
    }
  }

  return `Imported ${backup.cards.length} card(s) (${added} newly added).`;
}
