import path from "node:path";
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
 * With DATABASE_URL set we talk to Neon over HTTP. Without it we fall back to
 * PGlite, a real Postgres compiled to WASM that stores its data in ./.pglite,
 * so local dev needs no server and the SQL dialect stays identical.
 */
async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as Db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite(LOCAL_DATA_DIR);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;

  // Local only. Against Neon, migrations are applied by scripts/migrate.ts so
  // a cold serverless invocation never races to alter the schema.
  await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
  await seedIfEmpty(db);

  return db;
}

async function seedIfEmpty(db: Db) {
  const existing = await db.select({ id: schema.cards.id }).from(schema.cards).limit(1);
  if (existing.length > 0) return;
  const { seedDatabase } = await import("./seed");
  await seedDatabase(db);
}

const globalForDb = globalThis as unknown as { __cardpilotDb?: Promise<Db> };

/** Cached across hot reloads so PGlite opens its data directory only once. */
export function getDb(): Promise<Db> {
  globalForDb.__cardpilotDb ??= createDb();
  return globalForDb.__cardpilotDb;
}
