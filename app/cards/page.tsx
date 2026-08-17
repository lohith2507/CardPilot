import { getDb } from "@/db";
import { Wallet } from "@/components/wallet";
import { loadCatalog } from "@/lib/catalog";
import { resolveUserId } from "@/lib/session";
import { toCardView } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const userId = await resolveUserId();
  const db = await getDb();
  const catalog = await loadCatalog(db, userId);
  return <Wallet cards={catalog.map(toCardView)} />;
}
