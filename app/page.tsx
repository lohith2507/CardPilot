import { getDb } from "@/db";
import { Recommender, type MerchantChip } from "@/components/recommender";
import { mccLabel } from "@/lib/mcc";
import { countWallet, recentMerchants, starterMerchants } from "@/lib/recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await getDb();
  const [recent, walletCount] = await Promise.all([recentMerchants(db), countWallet(db)]);
  const chips = recent.length > 0 ? recent : await starterMerchants(db);

  const merchants: MerchantChip[] = chips.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    mcc: m.mcc,
    mccLabel: mccLabel(m.mcc),
    category: m.category,
  }));

  return <Recommender recents={merchants} walletCount={walletCount} />;
}
