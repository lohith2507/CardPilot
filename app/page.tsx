import { getDb } from "@/db";
import { Recommender, type MerchantChip } from "@/components/recommender";
import { mccLabel } from "@/lib/mcc";
import { countWallet, recentMerchants, starterMerchants } from "@/lib/recommend";
import { resolveUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await resolveUserId();
  const db = await getDb();
  const [recent, walletCount] = await Promise.all([
    recentMerchants(db, userId),
    countWallet(db, userId),
  ]);
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
