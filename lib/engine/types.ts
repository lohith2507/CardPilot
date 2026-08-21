/**
 * The engine deliberately knows nothing about Drizzle or the database. It takes
 * plain objects so every rule can be exercised in a unit test without a
 * connection, which is the whole point: this is where a wrong answer costs you
 * real money.
 */

export type CapPeriod = "month" | "quarter" | "year" | "none";

export type Network = "visa" | "mastercard" | "amex" | "discover";

export type EngineCurrency = {
  code: string;
  name: string;
  /** Cents per point at a plain cash redemption. */
  defaultCpp: number;
  /** Your own valuation, which wins when set. */
  userCpp: number | null;
  isCashback: boolean;
};

export type EngineRule = {
  id: number;
  label: string;
  mccCodes: number[];
  merchantSlugs: string[];
  rate: number;
  capAmountCents: number | null;
  capPeriod: CapPeriod;
  requiresActivation: boolean;
  selectionGroup: string | null;
  /** ISO yyyy-mm-dd, inclusive. */
  validFrom: string | null;
  validTo: string | null;
  priority: number;
  notes: string | null;
  verifiedAt: Date | null;
};

export type EngineCard = {
  id: number;
  slug: string;
  issuer: string;
  product: string;
  network: Network | string;
  annualFeeCents: number;
  fxFeePct: number;
  baseRate: number;
  colorFrom: string | null;
  colorTo: string | null;
  notes: string | null;
};

export type EngineSub = {
  requiredSpendCents: number;
  bonusValueCents: number;
  startedAt: string;
  deadline: string;
  /** Everything counted so far, including spend logged before this app. */
  spentCents: number;
};

export type WalletEntry = {
  userCardId: number;
  card: EngineCard;
  currency: EngineCurrency;
  rules: EngineRule[];
  /** { [ruleId]: true } for rotating categories you've opted into. */
  activations: Record<string, boolean>;
  /** { [selectionGroup]: ruleId } for choose-your-category cards. */
  selections: Record<string, number>;
  sub: EngineSub | null;
  /** { [ruleId]: cents already spent in the rule's current cap period }. */
  capUsedCents: Record<number, number>;
  /** 1–28 when monthly caps follow the statement cycle. */
  statementDay: number | null;
};

export type PurchaseContext = {
  mcc: number;
  merchantSlug: string | null;
  merchantName: string;
  amountCents: number;
  date: Date;
  isForeign: boolean;
  /** Networks this merchant refuses, e.g. Costco takes Visa only. */
  excludedNetworks: string[];
};

export type AppliedRule = {
  id: number;
  label: string;
  rate: number;
  /** Spend that earned the bonus rate before the cap cut it off. */
  bonusPortionCents: number;
  /** Spend that fell through to the card's base rate. */
  basePortionCents: number;
  capAmountCents: number | null;
  capPeriod: CapPeriod;
  capRemainingBeforeCents: number | null;
  notes: string | null;
  unverified: boolean;
};

/**
 * One line of the shown arithmetic. Kept as a label and a figure rather than a
 * sentence so the results screen can typeset it as a receipt you can audit.
 */
export type ReasonLine = {
  label: string;
  value: string;
  /** Qualifier shown beneath the line, e.g. which slice of the purchase. */
  note?: string;
  /** What the figure does to the total, left to the UI to colour. */
  tone?: "default" | "gain" | "cost";
};

export type CardScore = {
  userCardId: number;
  card: EngineCard;
  currency: EngineCurrency;
  eligible: boolean;
  ineligibleReason: string | null;
  /** Total value of the purchase as a percentage of what you spend. */
  effectiveRatePct: number;
  totalValueCents: number;
  earnValueCents: number;
  signupBonusValueCents: number;
  fxFeeCents: number;
  pointsEarned: number;
  cppUsed: number;
  appliedRule: AppliedRule | null;
  /** Every term that contributed to the number above, in order. */
  reasons: ReasonLine[];
  warnings: string[];
};
