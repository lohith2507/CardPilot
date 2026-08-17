import path from "node:path";
import dotenv from "dotenv";
import type { Db } from "../db";
import * as schema from "../db/schema";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const LOCAL_DATA_DIR = path.join(process.cwd(), ".pglite");

export type Connection = {
  db: Db;
  target: string;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Standalone connection for CLI scripts. Deliberately separate from getDb() so
 * a script never inherits the Next.js singleton, and so PGlite's data
 * directory is released when the script exits.
 */
export async function connect(): Promise<Connection> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(neon(url), { schema }) as unknown as Db;
    return {
      db,
      target: `Neon (${new URL(url).host})`,
      migrate: () => migrate(db as never, { migrationsFolder: MIGRATIONS_DIR }),
      close: async () => {},
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(LOCAL_DATA_DIR);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  return {
    db,
    target: `PGlite (${LOCAL_DATA_DIR})`,
    migrate: () => migrate(db as never, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => client.close(),
  };
}
