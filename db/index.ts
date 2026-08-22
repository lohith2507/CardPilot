import path from "node:path";
import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export const LOCAL_DATA_DIR = path.join(process.cwd(), ".pglite");
const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/**
 * Bump when schema patches below need to re-run on an already-open connection
 * (local HMR) or a long-lived serverless isolate.
 */
const SCHEMA_REV = 2;

/**
 * With DATABASE_URL set we talk to Neon over HTTP. Without it we fall back to
 * PGlite, a real Postgres compiled to WASM that stores its data in ./.pglite,
 * so local dev needs no server and the SQL dialect stays identical.
 */
async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const db = drizzle(neon(url), { schema }) as unknown as Db;
    // Neon migrations normally run via scripts/migrate.ts. Also apply
    // idempotent patches here so production recovers if a deploy shipped
    // ahead of a manual migrate (columns like household_code / statement_day).
    await ensureSchema(db);
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite(LOCAL_DATA_DIR);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;

  await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
  await ensureSchema(db);
  await seedIfEmpty(db);

  return db;
}

/**
 * Idempotent patches for columns/tables added after an existing database was
 * created. Safe to re-run on Neon and PGlite (IF NOT EXISTS).
 */
async function ensureSchema(db: Db) {
  await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "household_code" text`);
  await db.execute(
    sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trip_mode" boolean DEFAULT false NOT NULL`,
  );
  await db.execute(
    sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trip_abroad_default" boolean DEFAULT true NOT NULL`,
  );
  await db.execute(sql`ALTER TABLE "user_cards" ADD COLUMN IF NOT EXISTS "statement_day" integer`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_merchant_favorites" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE cascade,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_merchant_favorites_user_merchant_key"
    ON "user_merchant_favorites" USING btree ("user_id","merchant_id")
  `);
}

async function seedIfEmpty(db: Db) {
  const existing = await db.select({ id: schema.cards.id }).from(schema.cards).limit(1);
  if (existing.length > 0) return;
  const { seedDatabase } = await import("./seed");
  await seedDatabase(db);
}

const globalForDb = globalThis as unknown as {
  __cardpilotDb?: Promise<Db>;
  __cardpilotSchemaRev?: number;
};

/** Cached across hot reloads so PGlite opens its data directory only once. */
export function getDb(): Promise<Db> {
  const isLocal = !process.env.DATABASE_URL?.trim();

  globalForDb.__cardpilotDb ??= createDb().then((db) => {
    globalForDb.__cardpilotSchemaRev = SCHEMA_REV;
    return db;
  });

  return globalForDb.__cardpilotDb.then(async (db) => {
    // After HMR the client may predate new columns; patch without reopening PGlite.
    if (isLocal && globalForDb.__cardpilotSchemaRev !== SCHEMA_REV) {
      await ensureSchema(db);
      globalForDb.__cardpilotSchemaRev = SCHEMA_REV;
    }
    return db;
  });
}
