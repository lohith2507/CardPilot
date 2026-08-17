import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { AUTH_COOKIE, authRequired, authSecret, readSession, type Session } from "@/lib/auth";
import { hashPassword, normalizeEmail } from "@/lib/password";

/**
 * Kept apart from lib/auth.ts because that module also runs in the proxy, where
 * next/headers is unavailable.
 */
export async function currentSession(): Promise<Session | null> {
  const secret = authSecret();
  if (!secret) return null;

  const jar = await cookies();
  return readSession(jar.get(AUTH_COOKIE)?.value, secret);
}

/** Signed-in user, or a local guest when AUTH_SECRET is unset. */
export async function resolveUserId(): Promise<number> {
  const session = await currentSession();
  if (session) {
    if (session.mustChangePassword) redirect("/change-password");
    return session.userId;
  }
  if (!authRequired()) return ensureDevUser();
  redirect("/login");
}

export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}

export async function requirePasswordChangeSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/settings");
  return session;
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(s.users)
    .where(eq(s.users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function findUserById(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(s.users).where(eq(s.users.id, id)).limit(1);
  return row ?? null;
}

export function sessionFromUser(
  user: s.User,
  via: Session["via"],
): Omit<Session, "iat"> {
  return {
    via,
    userId: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Single local wallet owner when the auth gate is off. */
async function ensureDevUser(): Promise<number> {
  const email = "local@cardpilot.dev";
  const existing = await findUserByEmail(email);
  if (existing) return existing.id;

  const db = await getDb();
  const [created] = await db
    .insert(s.users)
    .values({
      email,
      passwordHash: await hashPassword(crypto.randomUUID()),
      isAdmin: true,
      mustChangePassword: false,
    })
    .returning();
  return created.id;
}
