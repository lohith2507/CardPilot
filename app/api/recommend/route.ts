import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { GroqNotConfiguredError, GroqRateLimitError } from "@/lib/groq";
import { recommend } from "@/lib/recommend";
import { resolveUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Unknown merchants need a web search plus a structured MCC map. */
export const maxDuration = 120;

const bodySchema = z.object({
  query: z.string().min(1, "Type where you are."),
  amountCents: z.number().int().min(1).max(100_000_000),
  isForeign: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        label: z.string(),
        amountCents: z.number().int().min(1).max(100_000_000),
        mcc: z.number().int().min(700).max(9999).optional(),
      }),
    )
    .max(4)
    .optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const userId = await resolveUserId();
    const db = await getDb();
    const result = await recommend(db, userId, parsed.data);
    if (!result) {
      return NextResponse.json(
        { error: `Could not find what “${parsed.data.query.trim()}” is. Try the full store or restaurant name.` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return NextResponse.json(
        {
          error:
            "That merchant isn't in your local list yet, and looking up new ones needs a Groq API key in .env.local.",
        },
        { status: 503 },
      );
    }
    if (err instanceof GroqRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error("recommend failed", err);
    return NextResponse.json({ error: "Could not compare cards for that place." }, { status: 500 });
  }
}
