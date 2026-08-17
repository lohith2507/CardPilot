import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { mccLabel } from "@/lib/mcc";
import { CONFIDENT_MATCH, isPlausibleAlias, matchScore } from "@/lib/merchant-match";
import { resolveMerchant, searchMerchants } from "@/lib/merchants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toChip(m: {
  id: number;
  slug: string;
  name: string;
  mcc: number;
  category: string;
}, extra?: { lookedUp?: boolean }) {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    mcc: m.mcc,
    mccLabel: mccLabel(m.mcc),
    category: m.category,
    lookedUp: extra?.lookedUp ?? false,
  };
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2) return NextResponse.json({ merchants: [] });

  const db = await getDb();
  const merchants = await searchMerchants(db, query);
  const top = merchants[0];
  const localIsSure =
    Boolean(top) &&
    matchScore(top, query) >= CONFIDENT_MATCH &&
    isPlausibleAlias(query, top.name);

  if (localIsSure) {
    return NextResponse.json({ merchants: merchants.map((m) => toChip(m)) });
  }

  if (query.trim().length < 3) {
    return NextResponse.json({ merchants: merchants.map((m) => toChip(m)) });
  }

  try {
    const resolved = await resolveMerchant(db, query);
    if (!resolved) {
      return NextResponse.json({ merchants: merchants.map((m) => toChip(m)) });
    }
    const lookedUp = resolved.source === "ai";
    const rest = merchants.filter((m) => m.id !== resolved.merchant.id);
    return NextResponse.json({
      merchants: [toChip(resolved.merchant, { lookedUp }), ...rest.map((m) => toChip(m))],
    });
  } catch (err) {
    console.error("merchant search lookup failed", err);
    return NextResponse.json({ merchants: merchants.map((m) => toChip(m)) });
  }
}
