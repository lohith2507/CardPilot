"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import type { ExtractedCard } from "@/lib/extract";
import { resolveUserId } from "@/lib/session";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/cards");
  revalidatePath("/settings");
}

async function ownedUserCard(userId: number, userCardId: number) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(s.userCards)
    .where(and(eq(s.userCards.id, userCardId), eq(s.userCards.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function addCardToWallet(cardId: number) {
  const userId = await resolveUserId();
  const db = await getDb();
  const existing = await db
    .select()
    .from(s.userCards)
    .where(and(eq(s.userCards.cardId, cardId), eq(s.userCards.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(s.userCards).set({ active: true }).where(eq(s.userCards.id, existing[0].id));
  } else {
    await db.insert(s.userCards).values({
      userId,
      cardId,
      activations: {},
      selections: {},
    });
  }
  revalidateAll();
}

export async function removeCardFromWallet(userCardId: number) {
  const userId = await resolveUserId();
  const row = await ownedUserCard(userId, userCardId);
  if (!row) return;
  const db = await getDb();
  await db.update(s.userCards).set({ active: false }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setActivation(userCardId: number, ruleId: number, on: boolean) {
  const userId = await resolveUserId();
  const row = await ownedUserCard(userId, userCardId);
  if (!row) return;

  const activations = { ...((row.activations ?? {}) as Record<string, boolean>) };
  if (on) activations[String(ruleId)] = true;
  else delete activations[String(ruleId)];

  const db = await getDb();
  await db.update(s.userCards).set({ activations }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setSelection(userCardId: number, group: string, ruleId: number | null) {
  const userId = await resolveUserId();
  const row = await ownedUserCard(userId, userCardId);
  if (!row) return;

  const selections = { ...((row.selections ?? {}) as Record<string, number>) };
  if (ruleId === null) delete selections[group];
  else selections[group] = ruleId;

  const db = await getDb();
  await db.update(s.userCards).set({ selections }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setUserCpp(currencyId: number, cpp: number | null) {
  const userId = await resolveUserId();
  const db = await getDb();

  if (cpp === null) {
    await db
      .delete(s.userCurrencyValuations)
      .where(
        and(
          eq(s.userCurrencyValuations.userId, userId),
          eq(s.userCurrencyValuations.currencyId, currencyId),
        ),
      );
  } else {
    const existing = await db
      .select()
      .from(s.userCurrencyValuations)
      .where(
        and(
          eq(s.userCurrencyValuations.userId, userId),
          eq(s.userCurrencyValuations.currencyId, currencyId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(s.userCurrencyValuations)
        .set({ cpp })
        .where(eq(s.userCurrencyValuations.id, existing[0].id));
    } else {
      await db.insert(s.userCurrencyValuations).values({
        userId,
        currencyId,
        cpp,
      });
    }
  }
  revalidateAll();
}

export async function saveSignupBonus(input: {
  userCardId: number;
  requiredSpendCents: number;
  bonusValueCents: number;
  startedAt: string;
  deadline: string;
  preloggedSpendCents: number;
}) {
  const userId = await resolveUserId();
  if (!(await ownedUserCard(userId, input.userCardId))) return;

  const db = await getDb();
  const existing = await db
    .select()
    .from(s.subProgress)
    .where(eq(s.subProgress.userCardId, input.userCardId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(s.subProgress).set(input).where(eq(s.subProgress.id, existing[0].id));
  } else {
    await db.insert(s.subProgress).values(input);
  }
  revalidateAll();
}

export async function deleteSignupBonus(userCardId: number) {
  const userId = await resolveUserId();
  if (!(await ownedUserCard(userId, userCardId))) return;
  const db = await getDb();
  await db.delete(s.subProgress).where(eq(s.subProgress.userCardId, userCardId));
  revalidateAll();
}

export async function verifyRule(ruleId: number) {
  await resolveUserId();
  const db = await getDb();
  await db.update(s.earnRules).set({ verifiedAt: new Date() }).where(eq(s.earnRules.id, ruleId));
  revalidateAll();
}

export async function deleteTransaction(id: number) {
  const userId = await resolveUserId();
  const db = await getDb();
  const [row] = await db
    .select({ id: s.transactions.id })
    .from(s.transactions)
    .innerJoin(s.userCards, eq(s.transactions.userCardId, s.userCards.id))
    .where(and(eq(s.transactions.id, id), eq(s.userCards.userId, userId)))
    .limit(1);
  if (!row) return;
  await db.delete(s.transactions).where(eq(s.transactions.id, id));
  revalidateAll();
}

/**
 * Writes a reviewed extraction to the catalog. Replacing the rules wholesale
 * rather than merging keeps the saved card identical to what you approved.
 */
export async function saveExtractedCard(extracted: ExtractedCard, addToWallet: boolean) {
  await resolveUserId();
  const db = await getDb();

  const currency = await resolveCurrency(db, extracted);

  const existing = await db.select().from(s.cards).where(eq(s.cards.slug, extracted.slug)).limit(1);

  const values = {
    slug: extracted.slug,
    issuer: extracted.issuer,
    product: extracted.product,
    network: extracted.network,
    annualFeeCents: extracted.annualFeeCents,
    fxFeePct: extracted.fxFeePct,
    baseRate: extracted.baseRate,
    currencyId: currency.id,
    colorFrom: extracted.colorFrom,
    colorTo: extracted.colorTo,
    notes: extracted.notes || null,
  };

  let cardId: number;
  if (existing.length > 0) {
    cardId = existing[0].id;
    await db.update(s.cards).set(values).where(eq(s.cards.id, cardId));
    await db.delete(s.earnRules).where(eq(s.earnRules.cardId, cardId));
  } else {
    const [inserted] = await db.insert(s.cards).values(values).returning();
    cardId = inserted.id;
  }

  if (extracted.rules.length > 0) {
    await db.insert(s.earnRules).values(
      extracted.rules.map((r) => ({
        cardId,
        label: r.label,
        mccCodes: r.mccCodes,
        merchantSlugs: r.merchantSlugs,
        rate: r.rate,
        capAmountCents: r.capAmountCents,
        capPeriod: r.capPeriod,
        requiresActivation: r.requiresActivation,
        selectionGroup: r.selectionGroup,
        validFrom: r.validFrom,
        validTo: r.validTo,
        priority: r.priority,
        sourceUrl: extracted.sourceUrl || null,
        verifiedAt: new Date(),
        notes: r.notes || null,
      })),
    );
  }

  if (addToWallet) await addCardToWallet(cardId);
  revalidateAll();
  return cardId;
}

async function resolveCurrency(
  db: Awaited<ReturnType<typeof getDb>>,
  extracted: ExtractedCard,
): Promise<s.PointCurrency> {
  const code = extracted.currencyCode.toUpperCase();
  const found = await db
    .select()
    .from(s.pointCurrencies)
    .where(eq(s.pointCurrencies.code, code))
    .limit(1);
  if (found.length > 0) return found[0];

  const [created] = await db
    .insert(s.pointCurrencies)
    .values({
      code,
      name: extracted.currencyName || code,
      defaultCpp: extracted.currencyDefaultCpp,
      isCashback: extracted.currencyIsCashback,
    })
    .returning();
  return created;
}

export async function findRuleByCardAndLabel(cardId: number, label: string) {
  await resolveUserId();
  const db = await getDb();
  const [row] = await db
    .select()
    .from(s.earnRules)
    .where(and(eq(s.earnRules.cardId, cardId), eq(s.earnRules.label, label)))
    .limit(1);
  return row ?? null;
}

export async function setStatementDay(userCardId: number, statementDay: number | null) {
  const userId = await resolveUserId();
  const row = await ownedUserCard(userId, userCardId);
  if (!row) return;
  const day =
    statementDay == null || !Number.isFinite(statementDay)
      ? null
      : Math.min(28, Math.max(1, Math.trunc(statementDay)));
  const db = await getDb();
  await db.update(s.userCards).set({ statementDay: day }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setTripMode(tripMode: boolean, tripAbroadDefault = true) {
  const userId = await resolveUserId();
  const db = await getDb();
  await db
    .update(s.users)
    .set({ tripMode, tripAbroadDefault, updatedAt: new Date() })
    .where(eq(s.users.id, userId));
  revalidateAll();
}

export async function setHouseholdCode(code: string | null) {
  const userId = await resolveUserId();
  const db = await getDb();
  const cleaned = code?.trim() ? code.trim().toLowerCase() : null;
  await db
    .update(s.users)
    .set({ householdCode: cleaned, updatedAt: new Date() })
    .where(eq(s.users.id, userId));
  revalidateAll();
}

export async function toggleFavorite(merchantId: number) {
  const userId = await resolveUserId();
  const db = await getDb();
  const { toggleFavoriteMerchant } = await import("@/lib/favorites");
  const on = await toggleFavoriteMerchant(db, userId, merchantId);
  revalidateAll();
  return on;
}

export async function correctMerchant(input: {
  merchantId: number;
  mcc: number;
  category: string;
  networkExclusions: string[];
  codingNote: string | null;
}) {
  const userId = await resolveUserId();
  void userId;
  const db = await getDb();
  const mcc = Math.trunc(input.mcc);
  if (mcc < 700 || mcc > 9999) throw new Error("MCC must be a four-digit code.");
  await db
    .update(s.merchants)
    .set({
      mcc,
      category: input.category.trim() || "Merchant",
      networkExclusions: input.networkExclusions,
      codingNote: input.codingNote?.trim() || null,
      source: "user",
    })
    .where(eq(s.merchants.id, input.merchantId));
  revalidateAll();
}

export async function exportWalletAction(includeTransactions = true) {
  const userId = await resolveUserId();
  const db = await getDb();
  const { exportWalletBackup } = await import("@/lib/wallet-io");
  return exportWalletBackup(db, userId, includeTransactions);
}

export async function importWalletAction(backup: unknown) {
  const userId = await resolveUserId();
  const db = await getDb();
  const { importWalletBackup } = await import("@/lib/wallet-io");
  const parsed = backup as import("@/lib/wallet-io").WalletBackup;
  if (!parsed || parsed.version !== 1) throw new Error("That file is not a CardPilot wallet backup.");
  const message = await importWalletBackup(db, userId, parsed);
  revalidateAll();
  return message;
}

