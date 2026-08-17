import { rankWallet } from "@/lib/engine/score";
import type { EngineRule, PurchaseContext, WalletEntry } from "@/lib/engine/types";
import { bestMatch, CONFIDENT_MATCH, normalizeQuery } from "@/lib/merchant-match";
import { mccLabel } from "@/lib/mcc";
import type { RecommendResult } from "@/lib/recommend";

const STORAGE_KEY = "cardpilot.snapshot.v1";

export type SnapshotMerchant = {
  id: number;
  slug: string;
  name: string;
  aliases: string[];
  mcc: number;
  category: string;
  networkExclusions: string[];
  codingNote: string | null;
};

export type Snapshot = {
  generatedAt: string;
  wallet: WalletEntry[];
  merchants: SnapshotMerchant[];
};

export function readSnapshot(): Snapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Array.isArray(parsed.wallet) || !Array.isArray(parsed.merchants)) return null;
    return { ...parsed, wallet: parsed.wallet.map(reviveEntry) };
  } catch {
    return null;
  }
}

export function writeSnapshot(snapshot: Snapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or blocked; offline ranking is a bonus, not a requirement.
  }
}

export async function refreshSnapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch("/api/snapshot", { cache: "no-store" });
    if (!res.ok) return null;
    const snapshot = (await res.json()) as Snapshot;
    writeSnapshot(snapshot);
    return { ...snapshot, wallet: snapshot.wallet.map(reviveEntry) };
  } catch {
    return null;
  }
}

/**
 * Ranks cards entirely in the browser from the cached snapshot. Used when the
 * network is unreachable, which is exactly when you're standing at a till in a
 * basement supermarket.
 */
export function recommendOffline(
  snapshot: Snapshot,
  query: string,
  amountCents: number,
  isForeign: boolean,
): RecommendResult | null {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const match = bestMatch(snapshot.merchants, normalized);
  if (!match || match.score < CONFIDENT_MATCH) return null;

  const merchant = match.merchant;
  const ctx: PurchaseContext = {
    mcc: merchant.mcc,
    merchantSlug: merchant.slug,
    merchantName: merchant.name,
    amountCents,
    date: new Date(),
    isForeign,
    excludedNetworks: merchant.networkExclusions,
  };

  return {
    merchant: {
      id: merchant.id,
      slug: merchant.slug,
      name: merchant.name,
      mcc: merchant.mcc,
      mccLabel: mccLabel(merchant.mcc),
      category: merchant.category,
      codingNote: merchant.codingNote,
      networkExclusions: merchant.networkExclusions,
    },
    resolvedBy: "cache",
    amountCents,
    isForeign,
    scores: rankWallet(snapshot.wallet, ctx),
    offline: true,
  };
}

/** JSON has no Date, and the engine compares verifiedAt against null. */
function reviveEntry(entry: WalletEntry): WalletEntry {
  return {
    ...entry,
    rules: entry.rules.map(
      (rule): EngineRule => ({
        ...rule,
        verifiedAt: rule.verifiedAt ? new Date(rule.verifiedAt) : null,
      }),
    ),
  };
}
