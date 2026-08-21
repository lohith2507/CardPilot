import { getDb } from "@/db";
import { Recommender, type MerchantChip } from "@/components/recommender";
import { QuarterlyChecklist } from "@/components/quarterly-checklist";
import { listFavoriteMerchants } from "@/lib/favorites";
import { mccLabel } from "@/lib/mcc";
import {
  countWallet,
  loadTripPrefs,
  pendingActivations,
  recentMerchants,
  starterMerchants,
} from "@/lib/recommend";
import { resolveUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await resolveUserId();
  const db = await getDb();
  const [recent, favorites, walletCount, pending, trip] = await Promise.all([
    recentMerchants(db, userId),
    listFavoriteMerchants(db, userId),
    countWallet(db, userId),
    pendingActivations(db, userId),
    loadTripPrefs(db, userId),
  ]);
  const starters = recent.length === 0 && favorites.length === 0 ? await starterMerchants(db) : [];

  const toChip = (m: { id: number; slug: string; name: string; mcc: number; category: string }, favorite: boolean): MerchantChip => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    mcc: m.mcc,
    mccLabel: mccLabel(m.mcc),
    category: m.category,
    favorite,
  });

  const favoriteIds = new Set(favorites.map((f) => f.id));
  const chips: MerchantChip[] = [
    ...favorites.map((m) => toChip(m, true)),
    ...recent.filter((m) => !favoriteIds.has(m.id)).map((m) => toChip(m, false)),
    ...starters.map((m) => toChip(m, false)),
  ].slice(0, 10);

  return (
    <div className="space-y-5">
      <QuarterlyChecklist items={pending} />
      <Recommender
        recents={chips}
        walletCount={walletCount}
        tripMode={trip.tripMode}
        tripAbroadDefault={trip.tripAbroadDefault}
      />
    </div>
  );
}
