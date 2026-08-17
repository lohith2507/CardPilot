import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_DATA_DIR = path.join(process.cwd(), ".pglite");

async function main() {
  if (process.env.DATABASE_URL?.trim()) {
    console.error("Refusing to reset: DATABASE_URL is set. Drop the remote database manually.");
    process.exit(1);
  }
  await fs.rm(LOCAL_DATA_DIR, { recursive: true, force: true });
  console.log(`Deleted ${LOCAL_DATA_DIR}. It will be recreated and seeded on next start.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
