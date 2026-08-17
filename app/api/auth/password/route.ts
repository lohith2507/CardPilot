import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { authSecret, sessionCookie, signSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { currentSession, sessionFromUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1),
  })
  .refine((body) => body.newPassword === body.confirmPassword, {
    message: "Those passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, session.userId)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // First-login change skips the current-password check; later changes require it.
  if (!user.mustChangePassword) {
    const { verifyPassword } = await import("@/lib/password");
    if (
      !parsed.data.currentPassword ||
      !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))
    ) {
      return NextResponse.json({ error: "Current password is wrong." }, { status: 401 });
    }
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const [updated] = await db
    .update(s.users)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(s.users.id, user.id))
    .returning();

  const secret = authSecret();
  if (!secret) {
    return NextResponse.json({ error: "Sessions cannot be signed." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    sessionCookie(await signSession(sessionFromUser(updated, session.via), secret)),
  );
  return response;
}
