import { and, eq, inArray, sql, asc } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";

/** User ids sharing this user's household code (case-insensitive), or just the user when none is set. */
export async function householdUserIds(db: Db, userId: number): Promise<number[]> {
  const [me] = await db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
  if (!me?.householdCode?.trim()) return [userId];
  const code = me.householdCode.trim().toLowerCase();
  const peers = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(sql`lower(${s.users.householdCode}) = ${code}`);
  return peers.map((p) => p.id);
}

/** Household favorites, most recently added first, deduped by merchant and capped at 12. */
export async function listFavoriteMerchants(db: Db, userId: number): Promise<s.Merchant[]> {
  const ids = await householdUserIds(db, userId);
  const rows = await db
    .select({ merchant: s.merchants })
    .from(s.userMerchantFavorites)
    .innerJoin(s.merchants, eq(s.userMerchantFavorites.merchantId, s.merchants.id))
    .where(inArray(s.userMerchantFavorites.userId, ids))
    .orderBy(asc(s.userMerchantFavorites.createdAt));
  const seen = new Set<number>();
  const out: s.Merchant[] = [];
  for (const row of [...rows].reverse()) {
    if (seen.has(row.merchant.id)) continue;
    seen.add(row.merchant.id);
    out.push(row.merchant);
    if (out.length >= 12) break;
  }
  return out;
}

/** True if anyone in the user's household has favorited this merchant. */
export async function isFavoriteMerchant(
  db: Db,
  userId: number,
  merchantId: number,
): Promise<boolean> {
  const ids = await householdUserIds(db, userId);
  const [row] = await db
    .select({ id: s.userMerchantFavorites.id })
    .from(s.userMerchantFavorites)
    .where(
      and(
        inArray(s.userMerchantFavorites.userId, ids),
        eq(s.userMerchantFavorites.merchantId, merchantId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Adds or removes only this user's own favorite (not household members').
 * Returns true when the merchant is now favorited.
 */
export async function toggleFavoriteMerchant(
  db: Db,
  userId: number,
  merchantId: number,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(s.userMerchantFavorites)
    .where(
      and(
        eq(s.userMerchantFavorites.userId, userId),
        eq(s.userMerchantFavorites.merchantId, merchantId),
      ),
    )
    .limit(1);
  if (existing) {
    await db.delete(s.userMerchantFavorites).where(eq(s.userMerchantFavorites.id, existing.id));
    return false;
  }
  await db.insert(s.userMerchantFavorites).values({ userId, merchantId });
  return true;
}
