import { connect } from "./connect";

async function main() {
  const { target, migrate, close } = await connect();
  console.log(`Applying migrations to ${target}`);
  await migrate();
  console.log("Migrations applied.");
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
