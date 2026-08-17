import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { Account } from "@/components/account";
import { Settings, type CurrencyView, type SubView, type TxView } from "@/components/settings";
import { loadCatalog, loadTransactions } from "@/lib/catalog";
import { loadWallet } from "@/lib/wallet";
import { toCardView } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await getDb();
  const [catalog, wallet, currencyRows, txRows] = await Promise.all([
    loadCatalog(db),
    loadWallet(db),
    db.select().from(s.pointCurrencies).orderBy(desc(s.pointCurrencies.isCashback)),
    loadTransactions(db),
  ]);

  const owned = catalog.filter((entry) => entry.inWallet);
  const cards = owned.map(toCardView);

  const currencies: CurrencyView[] = currencyRows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    defaultCpp: c.defaultCpp,
    userCpp: c.userCpp,
    isCashback: c.isCashback,
    notes: c.notes,
    usedBy: cards.filter((card) => card.currencyCode === c.code).map((card) => card.product),
  }));

  const subs: SubView[] = owned.flatMap((entry) => {
    if (!entry.sub || entry.userCardId === null) return [];
    const spent = wallet.find((w) => w.userCardId === entry.userCardId)?.sub?.spentCents ?? 0;
    return [
      {
        userCardId: entry.userCardId,
        requiredSpendCents: entry.sub.requiredSpendCents,
        bonusValueCents: entry.sub.bonusValueCents,
        startedAt: entry.sub.startedAt,
        deadline: entry.sub.deadline,
        preloggedSpendCents: entry.sub.preloggedSpendCents,
        spentCents: spent,
      },
    ];
  });

  const transactions: TxView[] = txRows.map((tx) => ({
    id: tx.id,
    merchantName: tx.merchantName,
    mcc: tx.mcc,
    amountCents: tx.amountCents,
    occurredAt: tx.occurredAt.toISOString(),
    product: tx.product,
    colorFrom: tx.colorFrom,
    colorTo: tx.colorTo,
  }));

  return (
    <div className="space-y-8">
      <Settings
        currencies={currencies}
        cards={cards}
        subs={subs}
        transactions={transactions}
      />
      <Account />
    </div>
  );
}
