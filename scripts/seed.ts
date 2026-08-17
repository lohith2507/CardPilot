import { sql } from "drizzle-orm";
import { connect } from "./connect";
import { seedDatabase } from "../db/seed";

async function main() {
  const { db, target, migrate, close } = await connect();
  console.log(`Seeding ${target}`);
  await migrate();

  // Order matters only for readability; RESTART IDENTITY CASCADE handles the FKs.
  await db.execute(
    sql`TRUNCATE TABLE transactions, sub_progress, user_cards, earn_rules, cards, merchants, point_currencies RESTART IDENTITY CASCADE`,
  );

  const counts = await seedDatabase(db);
  console.log(
    `Seeded ${counts.cards} cards, ${counts.rules} earn rules, ${counts.merchants} merchants, ` +
      `${counts.currencies} point currencies, ${counts.userCards} cards in your wallet.`,
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
