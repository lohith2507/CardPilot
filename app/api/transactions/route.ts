import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { resolveUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userCardId: z.number().int().positive(),
  merchantId: z.number().int().positive().nullable(),
  merchantName: z.string().min(1),
  mcc: z.number().int(),
  amountCents: z.number().int().min(1),
  earnRuleId: z.number().int().positive().nullable(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const userId = await resolveUserId();
  const db = await getDb();
  const [owned] = await db
    .select({ id: s.userCards.id })
    .from(s.userCards)
    .where(and(eq(s.userCards.id, parsed.data.userCardId), eq(s.userCards.userId, userId)))
    .limit(1);
  if (!owned) {
    return NextResponse.json({ error: "That card is not in your wallet." }, { status: 403 });
  }

  const [inserted] = await db
    .insert(s.transactions)
    .values({ ...parsed.data, occurredAt: new Date() })
    .returning();

  return NextResponse.json({ transaction: inserted });
}
