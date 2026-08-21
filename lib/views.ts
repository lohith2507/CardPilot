import type { CatalogEntry } from "@/lib/catalog";
import type { CardView, RuleView } from "@/components/wallet";
import { cardArtForSlug } from "@/lib/card-art";

/** Flattens a catalog entry into the plain shape the client components render. */
export function toCardView(entry: CatalogEntry): CardView {
  const cpp = entry.currency.userCpp ?? entry.currency.defaultCpp;

  const rules: RuleView[] = entry.rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    rate: rule.rate,
    capAmountCents: rule.capAmountCents,
    capPeriod: rule.capPeriod,
    capUsedCents: entry.capUsedCents[rule.id] ?? 0,
    requiresActivation: rule.requiresActivation,
    activated: entry.activations[String(rule.id)] === true,
    selectionGroup: rule.selectionGroup,
    selected: rule.selectionGroup ? entry.selections[rule.selectionGroup] === rule.id : true,
    unverified: rule.verifiedAt === null,
    notes: rule.notes,
  }));

  return {
    cardId: entry.card.id,
    slug: entry.card.slug,
    userCardId: entry.userCardId,
    inWallet: entry.inWallet,
    issuer: entry.card.issuer,
    product: entry.card.product,
    network: entry.card.network,
    colorFrom: entry.card.colorFrom,
    colorTo: entry.card.colorTo,
    artUrl: cardArtForSlug(entry.card.slug),
    annualFeeCents: entry.card.annualFeeCents,
    baseRate: entry.card.baseRate,
    fxFeePct: entry.card.fxFeePct,
    notes: entry.card.notes,
    currencyCode: entry.currency.code,
    currencyName: entry.currency.name,
    cpp,
    isCashback: entry.currency.isCashback,
    statementDay: entry.statementDay,
    rules,
  };
}
