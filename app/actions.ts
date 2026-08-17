"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import type { ExtractedCard } from "@/lib/extract";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/cards");
  revalidatePath("/settings");
}

export async function addCardToWallet(cardId: number) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(s.userCards)
    .where(eq(s.userCards.cardId, cardId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(s.userCards).set({ active: true }).where(eq(s.userCards.id, existing[0].id));
  } else {
    await db.insert(s.userCards).values({ cardId, activations: {}, selections: {} });
  }
  revalidateAll();
}

export async function removeCardFromWallet(userCardId: number) {
  const db = await getDb();
  await db.update(s.userCards).set({ active: false }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setActivation(userCardId: number, ruleId: number, on: boolean) {
  const db = await getDb();
  const [row] = await db.select().from(s.userCards).where(eq(s.userCards.id, userCardId)).limit(1);
  if (!row) return;

  const activations = { ...((row.activations ?? {}) as Record<string, boolean>) };
  if (on) activations[String(ruleId)] = true;
  else delete activations[String(ruleId)];

  await db.update(s.userCards).set({ activations }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setSelection(userCardId: number, group: string, ruleId: number | null) {
  const db = await getDb();
  const [row] = await db.select().from(s.userCards).where(eq(s.userCards.id, userCardId)).limit(1);
  if (!row) return;

  const selections = { ...((row.selections ?? {}) as Record<string, number>) };
  if (ruleId === null) delete selections[group];
  else selections[group] = ruleId;

  await db.update(s.userCards).set({ selections }).where(eq(s.userCards.id, userCardId));
  revalidateAll();
}

export async function setUserCpp(currencyId: number, cpp: number | null) {
  const db = await getDb();
  await db
    .update(s.pointCurrencies)
    .set({ userCpp: cpp })
    .where(eq(s.pointCurrencies.id, currencyId));
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
  const db = await getDb();
  await db.delete(s.subProgress).where(eq(s.subProgress.userCardId, userCardId));
  revalidateAll();
}

export async function verifyRule(ruleId: number) {
  const db = await getDb();
  await db.update(s.earnRules).set({ verifiedAt: new Date() }).where(eq(s.earnRules.id, ruleId));
  revalidateAll();
}

export async function deleteTransaction(id: number) {
  const db = await getDb();
  await db.delete(s.transactions).where(eq(s.transactions.id, id));
  revalidateAll();
}

/**
 * Writes a reviewed extraction to the catalog. Replacing the rules wholesale
 * rather than merging keeps the saved card identical to what you approved.
 */
export async function saveExtractedCard(extracted: ExtractedCard, addToWallet: boolean) {
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
        // You reviewed these before saving, so they count as verified.
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
      userCpp: extracted.currencyDefaultCpp,
      isCashback: extracted.currencyIsCashback,
    })
    .returning();
  return created;
}

export async function findRuleByCardAndLabel(cardId: number, label: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(s.earnRules)
    .where(and(eq(s.earnRules.cardId, cardId), eq(s.earnRules.label, label)))
    .limit(1);
  return row ?? null;
}
