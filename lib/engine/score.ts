import { formatCents, formatPct, formatRate } from "../utils";
import { periodLabel, toIsoDate } from "./period";
import type {
  AppliedRule,
  CardScore,
  EngineRule,
  PurchaseContext,
  ReasonLine,
  WalletEntry,
} from "./types";

/** Why a rule that looked like it should match didn't. */
type Exclusion = "window" | "activation" | "selection" | "capped";

type Candidate = {
  rule: EngineRule;
  capRemainingCents: number | null;
  excludedBy: Exclusion | null;
};

export function centsPerPoint(entry: WalletEntry): number {
  return entry.currency.userCpp ?? entry.currency.defaultCpp;
}

/** A rule pays out if the purchase's MCC or the merchant itself is named. */
export function ruleTargetsPurchase(rule: EngineRule, ctx: PurchaseContext): boolean {
  if (rule.merchantSlugs.length > 0 && ctx.merchantSlug) {
    if (rule.merchantSlugs.includes(ctx.merchantSlug)) return true;
  }
  return rule.mccCodes.includes(ctx.mcc);
}

function buildCandidates(entry: WalletEntry, ctx: PurchaseContext): Candidate[] {
  const today = toIsoDate(ctx.date);

  return entry.rules
    .filter((rule) => ruleTargetsPurchase(rule, ctx))
    .map((rule) => {
      let excludedBy: Exclusion | null = null;

      if ((rule.validFrom && today < rule.validFrom) || (rule.validTo && today > rule.validTo)) {
        excludedBy = "window";
      } else if (rule.requiresActivation && entry.activations[String(rule.id)] !== true) {
        excludedBy = "activation";
      } else if (rule.selectionGroup && entry.selections[rule.selectionGroup] !== rule.id) {
        excludedBy = "selection";
      }

      let capRemainingCents: number | null = null;
      if (rule.capAmountCents !== null && rule.capPeriod !== "none") {
        const used = entry.capUsedCents[rule.id] ?? 0;
        capRemainingCents = Math.max(0, rule.capAmountCents - used);
        if (excludedBy === null && capRemainingCents === 0) excludedBy = "capped";
      }

      return { rule, capRemainingCents, excludedBy };
    })
    .sort((a, b) => b.rule.rate - a.rule.rate || b.rule.priority - a.rule.priority);
}

export function scoreCard(entry: WalletEntry, ctx: PurchaseContext): CardScore {
  const { card, currency } = entry;
  const amountCents = Math.max(1, Math.round(ctx.amountCents));
  const cpp = centsPerPoint(entry);
  const reasons: ReasonLine[] = [];
  const warnings: string[] = [];

  if (ctx.excludedNetworks.includes(card.network)) {
    return {
      userCardId: entry.userCardId,
      card,
      currency,
      eligible: false,
      ineligibleReason: `${ctx.merchantName} does not accept ${networkName(card.network)}`,
      effectiveRatePct: 0,
      totalValueCents: 0,
      earnValueCents: 0,
      signupBonusValueCents: 0,
      fxFeeCents: 0,
      pointsEarned: 0,
      cppUsed: cpp,
      appliedRule: null,
      reasons: [],
      warnings: [],
    };
  }

  const candidates = buildCandidates(entry, ctx);
  const winner = candidates.find((c) => c.excludedBy === null) ?? null;

  let bonusPortionCents = 0;
  let basePortionCents = amountCents;
  let appliedRule: AppliedRule | null = null;

  if (winner) {
    const { rule, capRemainingCents } = winner;
    bonusPortionCents = capRemainingCents === null ? amountCents : Math.min(amountCents, capRemainingCents);
    basePortionCents = amountCents - bonusPortionCents;
    appliedRule = {
      id: rule.id,
      label: rule.label,
      rate: rule.rate,
      bonusPortionCents,
      basePortionCents,
      capAmountCents: rule.capAmountCents,
      capPeriod: rule.capPeriod,
      capRemainingBeforeCents: capRemainingCents,
      notes: rule.notes,
      unverified: rule.verifiedAt === null,
    };
  }

  const bonusRate = winner ? winner.rule.rate : 0;
  const pointsEarned =
    (bonusPortionCents / 100) * bonusRate + (basePortionCents / 100) * card.baseRate;
  const earnValueCents = pointsEarned * cpp;

  const fxFeeCents = ctx.isForeign ? (amountCents * card.fxFeePct) / 100 : 0;
  const signupBonusValueCents = signupBonusValue(entry, amountCents, ctx.date);

  const totalValueCents = earnValueCents + signupBonusValueCents - fxFeeCents;
  const effectiveRatePct = (totalValueCents / amountCents) * 100;

  // Every term that produced the number above, as a receipt line.
  const unit = currency.isCashback ? "%" : "x";
  const earned = (portionCents: number, rate: number) => {
    const points = (portionCents / 100) * rate;
    return currency.isCashback
      ? formatCents(Math.round(points * cpp))
      : `${round(points, 1)} ${currency.code}`;
  };

  if (appliedRule) {
    reasons.push({
      label: `${appliedRule.label} at ${formatRate(appliedRule.rate)}${unit}`,
      value: earned(bonusPortionCents, appliedRule.rate),
      note:
        basePortionCents > 0
          ? `the first ${formatCents(bonusPortionCents)} of ${formatCents(amountCents)}, where the cap runs out`
          : undefined,
    });
  }

  if (!appliedRule || basePortionCents > 0) {
    reasons.push({
      label: `Base rate at ${formatRate(card.baseRate)}${unit}`,
      value: earned(basePortionCents, card.baseRate),
      note: appliedRule
        ? `on the remaining ${formatCents(basePortionCents)}`
        : "no bonus category applies here",
    });
  }

  if (!currency.isCashback) {
    reasons.push({
      label: `${round(pointsEarned, 1)} ${currency.code} at ${cpp}c each`,
      value: formatCents(Math.round(earnValueCents)),
    });
  }

  if (appliedRule?.capRemainingBeforeCents != null) {
    reasons.push({
      label: `Bonus cap left ${periodLabel(appliedRule.capPeriod)}`,
      value: formatCents(appliedRule.capRemainingBeforeCents - bonusPortionCents),
      note: `out of ${formatCents(appliedRule.capAmountCents!)}`,
    });
  }

  if (signupBonusValueCents > 0 && entry.sub) {
    const remaining = Math.max(0, entry.sub.requiredSpendCents - entry.sub.spentCents);
    reasons.push({
      label: "Signup bonus progress",
      value: `+${formatCents(Math.round(signupBonusValueCents))}`,
      note: `${formatCents(remaining)} of the minimum spend still to go`,
      tone: "gain",
    });
  }

  if (fxFeeCents > 0) {
    reasons.push({
      label: `Foreign transaction fee of ${formatPct(card.fxFeePct)}`,
      value: `-${formatCents(Math.round(fxFeeCents))}`,
      tone: "cost",
    });
  }

  collectWarnings(entry, ctx, candidates, winner, warnings);

  return {
    userCardId: entry.userCardId,
    card,
    currency,
    eligible: true,
    ineligibleReason: null,
    effectiveRatePct,
    totalValueCents,
    earnValueCents,
    signupBonusValueCents,
    fxFeeCents,
    pointsEarned,
    cppUsed: cpp,
    appliedRule,
    reasons,
    warnings,
  };
}

/**
 * A signup bonus is attributed linearly across the minimum spend it requires,
 * so a purchase that covers 10% of the requirement carries 10% of the bonus.
 * During an open window this routinely outweighs any category multiplier.
 */
function signupBonusValue(entry: WalletEntry, amountCents: number, date: Date): number {
  const sub = entry.sub;
  if (!sub) return 0;

  const today = toIsoDate(date);
  if (today < sub.startedAt || today > sub.deadline) return 0;

  const remaining = sub.requiredSpendCents - sub.spentCents;
  if (remaining <= 0) return 0;

  const qualifying = Math.min(amountCents, remaining);
  return qualifying * (sub.bonusValueCents / sub.requiredSpendCents);
}

function collectWarnings(
  entry: WalletEntry,
  ctx: PurchaseContext,
  candidates: Candidate[],
  winner: Candidate | null,
  warnings: string[],
) {
  const appliedRate = winner?.rule.rate ?? entry.card.baseRate;

  for (const candidate of candidates) {
    if (candidate.excludedBy === null || candidate.rule.rate <= appliedRate) continue;

    const rate = `${formatRate(candidate.rule.rate)}${entry.currency.isCashback ? "%" : "x"}`;
    switch (candidate.excludedBy) {
      case "activation":
        warnings.push(`Activate "${candidate.rule.label}" to earn ${rate} here instead.`);
        break;
      case "selection":
        warnings.push(`Switching this card's category to "${candidate.rule.label}" would earn ${rate} here.`);
        break;
      case "capped":
        warnings.push(`The ${rate} "${candidate.rule.label}" cap is used up ${periodLabel(candidate.rule.capPeriod)}.`);
        break;
      case "window":
        break;
    }
  }

  if (winner?.rule.verifiedAt === null) {
    warnings.push("This rate has not been verified. Confirm it with the issuer before relying on it.");
  }

  if (entry.sub) {
    const daysLeft = Math.ceil(
      (Date.parse(`${entry.sub.deadline}T00:00:00Z`) - ctx.date.getTime()) / 86_400_000,
    );
    const remaining = entry.sub.requiredSpendCents - entry.sub.spentCents;
    if (remaining > 0 && daysLeft >= 0 && daysLeft <= 30) {
      warnings.push(`Signup bonus deadline in ${daysLeft} day${daysLeft === 1 ? "" : "s"} with ${formatCents(remaining)} still to spend.`);
    }
  }
}

export function rankWallet(entries: WalletEntry[], ctx: PurchaseContext): CardScore[] {
  return entries
    .map((entry) => scoreCard(entry, ctx))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (Math.abs(b.totalValueCents - a.totalValueCents) > 0.0001) {
        return b.totalValueCents - a.totalValueCents;
      }
      if (a.card.annualFeeCents !== b.card.annualFeeCents) {
        return a.card.annualFeeCents - b.card.annualFeeCents;
      }
      return a.card.product.localeCompare(b.card.product);
    });
}

function networkName(network: string): string {
  switch (network) {
    case "amex":
      return "American Express";
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "discover":
      return "Discover";
    default:
      return network;
  }
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
