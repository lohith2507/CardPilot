"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { hashPassword, normalizeEmail } from "@/lib/password";
import { requireAdmin } from "@/lib/session";

export type CreatedUserResult =
  | { ok: true; userId: number; email: string }
  | { ok: false; error: string };

export async function createUserAccount(input: {
  email: string;
  temporaryPassword: string;
  isAdmin?: boolean;
}): Promise<CreatedUserResult> {
  await requireAdmin();

  const email = normalizeEmail(input.email);
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (input.temporaryPassword.length < 8) {
    return { ok: false, error: "Temporary password needs at least 8 characters." };
  }

  const db = await getDb();
  const existing = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).limit(1);
  if (existing.length > 0) return { ok: false, error: "That email already has an account." };

  const passwordHash = await hashPassword(input.temporaryPassword);
  const [created] = await db
    .insert(s.users)
    .values({
      email,
      passwordHash,
      isAdmin: Boolean(input.isAdmin),
      mustChangePassword: true,
    })
    .returning();

  revalidatePath("/settings");
  return { ok: true, userId: created.id, email: created.email };
}

export async function listUsersForAdmin() {
  await requireAdmin();
  const db = await getDb();
  return db
    .select({
      id: s.users.id,
      email: s.users.email,
      isAdmin: s.users.isAdmin,
      mustChangePassword: s.users.mustChangePassword,
      createdAt: s.users.createdAt,
    })
    .from(s.users)
    .orderBy(desc(s.users.createdAt));
}
