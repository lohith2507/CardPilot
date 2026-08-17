import { describe, expect, it } from "vitest";
import { rankWallet, scoreCard } from "./score";
import { periodBounds } from "./period";
import type {
  EngineCard,
  EngineCurrency,
  EngineRule,
  PurchaseContext,
  WalletEntry,
} from "./types";

const NOW = new Date("2026-08-15T12:00:00Z");

const USD: EngineCurrency = {
  code: "USD",
  name: "Cash back",
  defaultCpp: 1,
  userCpp: 1,
  isCashback: true,
};

const MR: EngineCurrency = {
  code: "MR",
  name: "Amex Membership Rewards",
  defaultCpp: 0.6,
  userCpp: 1.8,
  isCashback: false,
};

let nextId = 1;

function rule(over: Partial<EngineRule> = {}): EngineRule {
  return {
    id: nextId++,
    label: "Bonus",
    mccCodes: [],
    merchantSlugs: [],
    rate: 3,
    capAmountCents: null,
    capPeriod: "none",
    requiresActivation: false,
    selectionGroup: null,
    validFrom: null,
    validTo: null,
    priority: 0,
    notes: null,
    verifiedAt: NOW,
    ...over,
  };
}

function card(over: Partial<EngineCard> = {}): EngineCard {
  return {
    id: nextId++,
    slug: "test-card",
    issuer: "Test Bank",
    product: "Test Card",
    network: "visa",
    annualFeeCents: 0,
    fxFeePct: 0,
    baseRate: 1,
    colorFrom: null,
    colorTo: null,
    notes: null,
    ...over,
  };
}

function entry(over: Partial<WalletEntry> = {}): WalletEntry {
  return {
    userCardId: nextId++,
    card: card(),
    currency: USD,
    rules: [],
    activations: {},
    selections: {},
    sub: null,
    capUsedCents: {},
    ...over,
  };
}

function ctx(over: Partial<PurchaseContext> = {}): PurchaseContext {
  return {
    mcc: 5814,
    merchantSlug: "mcdonalds",
    merchantName: "McDonald's",
    amountCents: 10_000,
    date: NOW,
    isForeign: false,
    excludedNetworks: [],
    ...over,
  };
}

describe("MCC matching", () => {
  it("applies a bonus rule whose MCC list contains the purchase", () => {
    const dining = rule({ label: "Dining", rate: 3, mccCodes: [5812, 5813, 5814] });
    const score = scoreCard(entry({ rules: [dining] }), ctx());

    expect(score.appliedRule?.label).toBe("Dining");
    expect(score.totalValueCents).toBe(300);
    expect(score.effectiveRatePct).toBeCloseTo(3);
  });

  it("falls back to the base rate when no rule matches the MCC", () => {
    const dining = rule({ label: "Dining", rate: 3, mccCodes: [5812] });
    const score = scoreCard(entry({ rules: [dining] }), ctx({ mcc: 5411 }));

    expect(score.appliedRule).toBeNull();
    expect(score.totalValueCents).toBe(100);
    expect(score.reasons[0].label).toBe("Base rate at 1%");
    expect(score.reasons[0].note).toBe("no bonus category applies here");
  });

  it("matches a named merchant even when the MCC is not listed", () => {
    const portal = rule({ label: "Chase Travel", rate: 5, merchantSlugs: ["chase-travel"] });
    const score = scoreCard(
      entry({ rules: [portal] }),
      ctx({ mcc: 4722, merchantSlug: "chase-travel", merchantName: "Chase Travel" }),
    );

    expect(score.appliedRule?.label).toBe("Chase Travel");
    expect(score.totalValueCents).toBe(500);
  });

  it("picks the highest rate when several rules match, breaking ties on priority", () => {
    const low = rule({ label: "Travel", rate: 2, mccCodes: [4722] });
    const high = rule({ label: "Portal", rate: 5, mccCodes: [4722] });
    const tie = rule({ label: "Preferred portal", rate: 5, mccCodes: [4722], priority: 10 });

    const score = scoreCard(entry({ rules: [low, high, tie] }), ctx({ mcc: 4722 }));
    expect(score.appliedRule?.label).toBe("Preferred portal");
  });
});

describe("cap handling", () => {
  it("splits a purchase that straddles the cap across the bonus and base rates", () => {
    // Blue Cash Preferred: 6% groceries capped at $6,000/yr, $5,950 already spent.
    const groceries = rule({
      label: "US supermarkets",
      rate: 6,
      mccCodes: [5411],
      capAmountCents: 600_000,
      capPeriod: "year",
    });
    const score = scoreCard(
      entry({ rules: [groceries], capUsedCents: { [groceries.id]: 595_000 } }),
      ctx({ mcc: 5411, merchantSlug: "kroger", merchantName: "Kroger", amountCents: 20_000 }),
    );

    expect(score.appliedRule?.bonusPortionCents).toBe(5_000);
    expect(score.appliedRule?.basePortionCents).toBe(15_000);
    // $50 at 6% = $3.00, plus $150 at 1% = $1.50.
    expect(score.totalValueCents).toBe(450);
    expect(score.effectiveRatePct).toBeCloseTo(2.25);

    // Both halves of the split are shown, not just the total.
    expect(score.reasons[0]).toMatchObject({
      label: "US supermarkets at 6%",
      value: "$3",
    });
    expect(score.reasons[1]).toMatchObject({
      label: "Base rate at 1%",
      value: "$1.50",
      note: "on the remaining $150",
    });
  });

  it("falls through to the next best rule once a cap is exhausted", () => {
    const rotating = rule({
      label: "Rotating 5%",
      rate: 5,
      mccCodes: [5814],
      capAmountCents: 150_000,
      capPeriod: "quarter",
      priority: 20,
    });
    const dining = rule({ label: "Dining", rate: 3, mccCodes: [5812, 5813, 5814] });

    const score = scoreCard(
      entry({ rules: [rotating, dining], capUsedCents: { [rotating.id]: 150_000 } }),
      ctx(),
    );

    expect(score.appliedRule?.label).toBe("Dining");
    expect(score.totalValueCents).toBe(300);
    expect(score.warnings.some((w) => w.includes("cap is used up"))).toBe(true);
  });

  it("reports how much of the cap is left after the purchase", () => {
    const groceries = rule({
      label: "US supermarkets",
      rate: 6,
      mccCodes: [5411],
      capAmountCents: 600_000,
      capPeriod: "year",
    });
    const score = scoreCard(entry({ rules: [groceries] }), ctx({ mcc: 5411, amountCents: 10_000 }));

    expect(score.reasons).toContainEqual({
      label: "Bonus cap left this year",
      value: "$5,900",
      note: "out of $6,000",
    });
  });

  it("computes calendar period bounds for cap windows", () => {
    expect(periodBounds("quarter", NOW)).toEqual({
      start: new Date("2026-07-01T00:00:00Z"),
      end: new Date("2026-10-01T00:00:00Z"),
    });
    expect(periodBounds("month", NOW)?.start).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(periodBounds("year", NOW)?.end).toEqual(new Date("2027-01-01T00:00:00Z"));
    expect(periodBounds("none", NOW)).toBeNull();
  });
});

describe("point valuation", () => {
  it("converts points to cash at your own cents-per-point", () => {
    // Amex Gold: 4x MR on restaurants, valued at 1.8c each.
    const dining = rule({ label: "Restaurants", rate: 4, mccCodes: [5814] });
    const gold = entry({
      card: card({ slug: "amex-gold", product: "Gold Card", network: "amex", annualFeeCents: 32_500 }),
      currency: MR,
      rules: [dining],
    });

    const score = scoreCard(gold, ctx());
    expect(score.pointsEarned).toBe(400);
    expect(score.totalValueCents).toBeCloseTo(720);
    expect(score.effectiveRatePct).toBeCloseTo(7.2);
  });

  it("lets a low valuation flip the ranking against a flat cashback card", () => {
    const dining = rule({ label: "Restaurants", rate: 4, mccCodes: [5814] });
    const goldRules = { rules: [dining] };
    const doubleCash = entry({
      card: card({ slug: "citi-double-cash", product: "Double Cash", baseRate: 2 }),
      currency: USD,
    });

    // At the cash-out rate of 0.6c, 4x MR is only 2.4% and still edges out 2%.
    const cashOutGold = entry({
      card: card({ slug: "amex-gold", product: "Gold Card", network: "amex" }),
      currency: { ...MR, userCpp: 0.6 },
      ...goldRules,
    });
    expect(rankWallet([doubleCash, cashOutGold], ctx())[0].card.slug).toBe("amex-gold");

    // Value them at 0.4c and the flat 2% card wins instead.
    const pessimisticGold = entry({
      card: card({ slug: "amex-gold", product: "Gold Card", network: "amex" }),
      currency: { ...MR, userCpp: 0.4 },
      ...goldRules,
    });
    expect(rankWallet([doubleCash, pessimisticGold], ctx())[0].card.slug).toBe("citi-double-cash");
  });
});

describe("activation and selection", () => {
  it("ignores a rotating category that has not been activated", () => {
    const rotating = rule({
      label: "Rotating 5%",
      rate: 5,
      mccCodes: [5814],
      requiresActivation: true,
      capAmountCents: 150_000,
      capPeriod: "quarter",
    });
    const score = scoreCard(entry({ rules: [rotating] }), ctx());

    expect(score.appliedRule).toBeNull();
    expect(score.totalValueCents).toBe(100);
    expect(score.warnings.some((w) => w.includes("Activate"))).toBe(true);
  });

  it("applies the rotating category once activated", () => {
    const rotating = rule({
      label: "Rotating 5%",
      rate: 5,
      mccCodes: [5814],
      requiresActivation: true,
      capAmountCents: 150_000,
      capPeriod: "quarter",
    });
    const score = scoreCard(
      entry({ rules: [rotating], activations: { [String(rotating.id)]: true } }),
      ctx(),
    );

    expect(score.appliedRule?.label).toBe("Rotating 5%");
    expect(score.totalValueCents).toBe(500);
  });

  it("only pays the selected category on a choose-your-category card", () => {
    const dining = rule({ label: "5x: Restaurants", rate: 5, mccCodes: [5814], selectionGroup: "custom" });
    const gas = rule({ label: "5x: Gas", rate: 5, mccCodes: [5542], selectionGroup: "custom" });

    const pickedGas = entry({ rules: [dining, gas], selections: { custom: gas.id } });
    const atMcDonalds = scoreCard(pickedGas, ctx());
    expect(atMcDonalds.appliedRule).toBeNull();
    expect(atMcDonalds.warnings.some((w) => w.includes("Switching this card's category"))).toBe(true);

    const pickedDining = entry({ rules: [dining, gas], selections: { custom: dining.id } });
    expect(scoreCard(pickedDining, ctx()).appliedRule?.label).toBe("5x: Restaurants");
  });

  it("ignores a rule outside its validity window", () => {
    const expired = rule({
      label: "Q2 rotating",
      rate: 5,
      mccCodes: [5814],
      validFrom: "2026-04-01",
      validTo: "2026-06-30",
    });
    expect(scoreCard(entry({ rules: [expired] }), ctx()).appliedRule).toBeNull();
  });
});

describe("foreign transaction fees", () => {
  it("subtracts the fee from the value earned", () => {
    const flat = entry({ card: card({ baseRate: 2, fxFeePct: 3 }) });
    const score = scoreCard(flat, ctx({ isForeign: true }));

    // $100 earns $2.00 and is charged $3.00, so the purchase is net negative.
    expect(score.fxFeeCents).toBe(300);
    expect(score.totalValueCents).toBe(-100);
    expect(score.effectiveRatePct).toBeCloseTo(-1);
  });

  it("ranks a no-fee card ahead of a higher earner abroad", () => {
    const feeCard = entry({
      card: card({ slug: "fee-card", product: "Fee Card", baseRate: 3, fxFeePct: 3 }),
    });
    const noFeeCard = entry({
      card: card({ slug: "no-fee-card", product: "No Fee Card", baseRate: 2, fxFeePct: 0 }),
    });

    const abroad = rankWallet([feeCard, noFeeCard], ctx({ isForeign: true }));
    expect(abroad[0].card.slug).toBe("no-fee-card");

    const athome = rankWallet([feeCard, noFeeCard], ctx());
    expect(athome[0].card.slug).toBe("fee-card");
  });
});

describe("signup bonus", () => {
  it("dominates category multipliers while the minimum spend is open", () => {
    const subCard = entry({
      card: card({ slug: "new-card", product: "New Card", baseRate: 1 }),
      sub: {
        requiredSpendCents: 400_000,
        bonusValueCents: 60_000,
        startedAt: "2026-07-01",
        deadline: "2026-10-01",
        spentCents: 0,
      },
    });
    const gold = entry({
      card: card({ slug: "amex-gold", product: "Gold Card", network: "amex" }),
      currency: MR,
      rules: [rule({ label: "Restaurants", rate: 4, mccCodes: [5814] })],
    });

    const score = scoreCard(subCard, ctx());
    // $100 of a $4,000 requirement carries 2.5% of a $600 bonus, so $15.
    expect(score.signupBonusValueCents).toBeCloseTo(1_500);
    expect(score.effectiveRatePct).toBeCloseTo(16);
    expect(rankWallet([gold, subCard], ctx())[0].card.slug).toBe("new-card");
  });

  it("stops counting once the minimum spend is met", () => {
    const done = entry({
      sub: {
        requiredSpendCents: 400_000,
        bonusValueCents: 60_000,
        startedAt: "2026-07-01",
        deadline: "2026-10-01",
        spentCents: 400_000,
      },
    });
    expect(scoreCard(done, ctx()).signupBonusValueCents).toBe(0);
  });

  it("only credits the portion of a purchase that still counts toward the minimum", () => {
    const nearlyDone = entry({
      sub: {
        requiredSpendCents: 400_000,
        bonusValueCents: 60_000,
        startedAt: "2026-07-01",
        deadline: "2026-10-01",
        spentCents: 395_000,
      },
    });
    // Only $50 of a $100 purchase still counts, so half the marginal bonus.
    const score = scoreCard(nearlyDone, ctx({ amountCents: 10_000 }));
    expect(score.signupBonusValueCents).toBeCloseTo(750);
  });

  it("ignores a bonus whose deadline has passed", () => {
    const expired = entry({
      sub: {
        requiredSpendCents: 400_000,
        bonusValueCents: 60_000,
        startedAt: "2026-01-01",
        deadline: "2026-04-01",
        spentCents: 0,
      },
    });
    expect(scoreCard(expired, ctx()).signupBonusValueCents).toBe(0);
  });

  it("warns when the deadline is close and spend is still outstanding", () => {
    const urgent = entry({
      sub: {
        requiredSpendCents: 400_000,
        bonusValueCents: 60_000,
        startedAt: "2026-07-01",
        deadline: "2026-08-25",
        spentCents: 100_000,
      },
    });
    expect(scoreCard(urgent, ctx()).warnings.some((w) => w.includes("deadline in 10 days"))).toBe(true);
  });
});

describe("network acceptance", () => {
  it("marks a card ineligible where the merchant refuses its network", () => {
    const amex = entry({ card: card({ slug: "amex-gold", product: "Gold Card", network: "amex" }) });
    const visa = entry({ card: card({ slug: "costco-visa", product: "Costco Visa", network: "visa" }) });

    const atCostco = ctx({
      mcc: 5300,
      merchantSlug: "costco",
      merchantName: "Costco",
      excludedNetworks: ["amex", "mastercard", "discover"],
    });

    const ranked = rankWallet([amex, visa], atCostco);
    expect(ranked[0].card.slug).toBe("costco-visa");
    expect(ranked[1].eligible).toBe(false);
    expect(ranked[1].ineligibleReason).toContain("does not accept American Express");
  });
});

describe("verification", () => {
  it("warns when the winning rate has never been verified", () => {
    const unverified = rule({ label: "Rotating 5%", rate: 5, mccCodes: [5814], verifiedAt: null });
    const score = scoreCard(entry({ rules: [unverified] }), ctx());

    expect(score.appliedRule?.unverified).toBe(true);
    expect(score.warnings.some((w) => w.includes("not been verified"))).toBe(true);
  });
});
