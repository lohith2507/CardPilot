import type { Config } from "drizzle-kit";

// Only used by `drizzle-kit generate`, which reads the schema and emits SQL
// without opening a connection. Migrations are applied by scripts/migrate.ts,
// which picks the Neon or PGlite driver at runtime.
export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
} satisfies Config;
