import { getDb } from "@/db";
import { Account } from "@/components/account";
import { AdminAccounts } from "@/components/admin-accounts";
import { Settings, type CurrencyView, type SubView, type TxView } from "@/components/settings";
import { listUsersForAdmin } from "@/app/actions/users";
import { loadCatalog, loadCurrenciesForUser, loadTransactions } from "@/lib/catalog";
import { currentSession, resolveUserId } from "@/lib/session";
import { loadWallet } from "@/lib/wallet";
import { toCardView } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await resolveUserId();
  const session = await currentSession();
  const db = await getDb();
  const [catalog, wallet, currencyRows, txRows] = await Promise.all([
    loadCatalog(db, userId),
    loadWallet(db, userId),
    loadCurrenciesForUser(db, userId),
    loadTransactions(db, userId),
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

  const users = session?.isAdmin
    ? (await listUsersForAdmin()).map((u) => ({
        ...u,
        createdAt: u.createdAt,
      }))
    : [];

  return (
    <div className="space-y-8">
      <Settings
        currencies={currencies}
        cards={cards}
        subs={subs}
        transactions={transactions}
      />
      {session?.isAdmin ? <AdminAccounts users={users} /> : null}
      <Account />
    </div>
  );
}
