import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Money is stored as integer cents everywhere. Rates are stored as decimal
 * multipliers where 1.0 means "1 point (or 1%) per dollar", so a 4x dining
 * card and a 4% cashback card are the same number and comparable once each is
 * multiplied by its currency's cents-per-point.
 */

export const pointCurrencies = pgTable("point_currencies", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Cents each point is worth at a plain cash redemption. */
  defaultCpp: numeric("default_cpp", { precision: 6, scale: 3, mode: "number" }).notNull(),
  /** Your own valuation, which overrides the default when set. */
  userCpp: numeric("user_cpp", { precision: 6, scale: 3, mode: "number" }),
  /** Cashback currencies can't be transferred, so the ceiling is the default. */
  isCashback: boolean("is_cashback").notNull().default(false),
  notes: text("notes"),
});

export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  issuer: text("issuer").notNull(),
  product: text("product").notNull(),
  /** visa | mastercard | amex | discover */
  network: text("network").notNull(),
  annualFeeCents: integer("annual_fee_cents").notNull().default(0),
  /** Percent surcharge on foreign purchases, e.g. 3 for 3%. */
  fxFeePct: numeric("fx_fee_pct", { precision: 5, scale: 2, mode: "number" })
    .notNull()
    .default(0),
  /** Earn multiplier applied when no bonus rule matches. */
  baseRate: numeric("base_rate", { precision: 6, scale: 3, mode: "number" })
    .notNull()
    .default(1),
  currencyId: integer("currency_id")
    .notNull()
    .references(() => pointCurrencies.id, { onDelete: "restrict" }),
  colorFrom: text("color_from"),
  colorTo: text("color_to"),
  notes: text("notes"),
});

export const earnRules = pgTable(
  "earn_rules",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Merchant category codes this rule pays out on. */
    mccCodes: integer("mcc_codes").array().notNull().default([]),
    /** Named merchants this rule pays out on regardless of MCC. */
    merchantSlugs: text("merchant_slugs").array().notNull().default([]),
    rate: numeric("rate", { precision: 6, scale: 3, mode: "number" }).notNull(),
    /** Spend ceiling before the rate drops back to the card's base rate. */
    capAmountCents: integer("cap_amount_cents"),
    /** month | quarter | year | none */
    capPeriod: text("cap_period").notNull().default("none"),
    /** Rotating categories you have to opt into each quarter. */
    requiresActivation: boolean("requires_activation").notNull().default(false),
    /**
     * Rules sharing a group are mutually exclusive: only the one you've picked
     * earns. Models Citi Custom Cash and BoA Customized Cash.
     */
    selectionGroup: text("selection_group"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    /** Higher wins when two rules match the same purchase at equal rates. */
    priority: integer("priority").notNull().default(0),
    sourceUrl: text("source_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [index("earn_rules_card_id_idx").on(t.cardId)],
);

export const userCards = pgTable(
  "user_cards",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    nickname: text("nickname"),
    openedAt: date("opened_at"),
    active: boolean("active").notNull().default(true),
    /** { [earnRuleId]: true } for rotating categories you've activated. */
    activations: jsonb("activations").notNull().default({}),
    /** { [selectionGroup]: earnRuleId } for choose-your-category cards. */
    selections: jsonb("selections").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_cards_card_id_key").on(t.cardId)],
);

export const subProgress = pgTable(
  "sub_progress",
  {
    id: serial("id").primaryKey(),
    userCardId: integer("user_card_id")
      .notNull()
      .references(() => userCards.id, { onDelete: "cascade" }),
    requiredSpendCents: integer("required_spend_cents").notNull(),
    /** Cash value of the bonus, so it can be compared against earn rates. */
    bonusValueCents: integer("bonus_value_cents").notNull(),
    startedAt: date("started_at").notNull(),
    deadline: date("deadline").notNull(),
    /** Spend that happened before you started logging in this app. */
    preloggedSpendCents: integer("prelogged_spend_cents").notNull().default(0),
  },
  (t) => [uniqueIndex("sub_progress_user_card_id_key").on(t.userCardId)],
);

export const merchants = pgTable(
  "merchants",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default([]),
    mcc: integer("mcc").notNull(),
    category: text("category").notNull(),
    /** Networks this merchant refuses, e.g. Costco takes Visa only. */
    networkExclusions: text("network_exclusions").array().notNull().default([]),
    /** { [issuerSlug]: mcc } when one issuer codes the merchant differently. */
    issuerOverrides: jsonb("issuer_overrides").notNull().default({}),
    /** seed | llm | user */
    source: text("source").notNull().default("seed"),
    /** Surfaced in the UI when a merchant codes counterintuitively. */
    codingNote: text("coding_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("merchants_mcc_idx").on(t.mcc)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    userCardId: integer("user_card_id")
      .notNull()
      .references(() => userCards.id, { onDelete: "cascade" }),
    merchantId: integer("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    merchantName: text("merchant_name").notNull(),
    mcc: integer("mcc").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Which rule paid out, so cap usage can be attributed precisely. */
    earnRuleId: integer("earn_rule_id").references(() => earnRules.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_card_idx").on(t.userCardId, t.occurredAt),
    index("transactions_occurred_at_idx").on(t.occurredAt),
  ],
);

export const cardsRelations = relations(cards, ({ one, many }) => ({
  currency: one(pointCurrencies, {
    fields: [cards.currencyId],
    references: [pointCurrencies.id],
  }),
  earnRules: many(earnRules),
}));

export const earnRulesRelations = relations(earnRules, ({ one }) => ({
  card: one(cards, { fields: [earnRules.cardId], references: [cards.id] }),
}));

export const userCardsRelations = relations(userCards, ({ one, many }) => ({
  card: one(cards, { fields: [userCards.cardId], references: [cards.id] }),
  sub: one(subProgress),
  transactions: many(transactions),
}));

export const subProgressRelations = relations(subProgress, ({ one }) => ({
  userCard: one(userCards, {
    fields: [subProgress.userCardId],
    references: [userCards.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  userCard: one(userCards, {
    fields: [transactions.userCardId],
    references: [userCards.id],
  }),
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
}));

export type PointCurrency = typeof pointCurrencies.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type EarnRule = typeof earnRules.$inferSelect;
export type UserCard = typeof userCards.$inferSelect;
export type SubProgress = typeof subProgress.$inferSelect;
export type Merchant = typeof merchants.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
