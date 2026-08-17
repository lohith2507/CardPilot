import { NextResponse } from "next/server";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { resolveUserId } from "@/lib/session";
import { loadWallet } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the browser needs to rank cards without a network: this user's
 * wallet with its rules and current cap usage, plus the known merchants.
 */
export async function GET() {
  const userId = await resolveUserId();
  const db = await getDb();
  const [wallet, merchants] = await Promise.all([
    loadWallet(db, userId),
    db
      .select({
        id: s.merchants.id,
        slug: s.merchants.slug,
        name: s.merchants.name,
        aliases: s.merchants.aliases,
        mcc: s.merchants.mcc,
        category: s.merchants.category,
        networkExclusions: s.merchants.networkExclusions,
        codingNote: s.merchants.codingNote,
      })
      .from(s.merchants),
  ]);

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), wallet, merchants },
    { headers: { "Cache-Control": "no-store" } },
  );
}
