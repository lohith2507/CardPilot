import { getDb } from "@/db";
import { CardImporter } from "@/components/card-importer";
import { loadCatalog } from "@/lib/catalog";
import type { CatalogPick } from "@/lib/card-directory";
import { resolveUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AddCardPage() {
  const userId = await resolveUserId();
  const db = await getDb();
  const catalog = await loadCatalog(db, userId);
  const picks: CatalogPick[] = catalog.map((entry) => ({
    cardId: entry.card.id,
    slug: entry.card.slug,
    issuer: entry.card.issuer,
    product: entry.card.product,
    network: entry.card.network,
    colorFrom: entry.card.colorFrom,
    colorTo: entry.card.colorTo,
    inWallet: entry.inWallet,
    annualFeeCents: entry.card.annualFeeCents,
    baseRate: entry.card.baseRate,
    isCashback: entry.currency.isCashback,
  }));

  return <CardImporter catalog={picks} />;
}
