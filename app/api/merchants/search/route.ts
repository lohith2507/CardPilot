import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { mccLabel } from "@/lib/mcc";
import { searchMerchants } from "@/lib/merchants";

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
  return NextResponse.json({ merchants: merchants.map((m) => toChip(m)) });
}
