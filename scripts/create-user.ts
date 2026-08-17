import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { eq } from "drizzle-orm";
import * as s from "../db/schema";
import { hashPassword, normalizeEmail } from "../lib/password";
import { connect } from "./connect";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const emailRaw = arg("--email");
  const password = arg("--password");
  const isAdmin = hasFlag("--admin");

  const reset = hasFlag("--reset");

  if (!emailRaw || !password) {
    console.error(
      "Usage: npm run user:create -- --email you@example.com --password 'temp-pass' [--admin] [--reset]",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const email = normalizeEmail(emailRaw);
  const { db, close } = await connect();
  try {
    const existing = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);
    if (existing.length > 0) {
      if (!reset) {
        console.error(`User already exists: ${email}. Pass --reset to issue a new temporary password.`);
        process.exit(1);
      }

      const [updated] = await db
        .update(s.users)
        .set({
          passwordHash: await hashPassword(password),
          isAdmin: isAdmin || existing[0].isAdmin,
          mustChangePassword: true,
          updatedAt: new Date(),
        })
        .where(eq(s.users.id, existing[0].id))
        .returning();

      console.log(
        `Reset ${updated.email} (id ${updated.id})${updated.isAdmin ? " as admin" : ""}. They must change the password on next login.`,
      );
      return;
    }

    const [created] = await db
      .insert(s.users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        isAdmin,
        mustChangePassword: true,
      })
      .returning();

    console.log(
      `Created ${created.email} (id ${created.id})${isAdmin ? " as admin" : ""}. They must change the password on first login.`,
    );
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
