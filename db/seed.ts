import type { Db } from "./index";
import * as s from "./schema";
import { MCC, MCC_TRAVEL_BROAD } from "../lib/mcc";

/**
 * Seeded from publicly published card terms. Rates change, so treat these as a
 * starting point rather than gospel: rotating-category rules are deliberately
 * left unverified, and the add-card flow lets you re-extract any card from its
 * current terms.
 */
const SEEDED_AT = new Date("2026-01-01T00:00:00Z");

type RuleSeed = {
  label: string;
  rate: number;
  mccCodes?: number[];
  merchantSlugs?: string[];
  capAmountCents?: number;
  capPeriod?: "month" | "quarter" | "year" | "none";
  requiresActivation?: boolean;
  selectionGroup?: string;
  validFrom?: string;
  validTo?: string;
  priority?: number;
  notes?: string;
  unverified?: boolean;
};

type CardSeed = {
  slug: string;
  issuer: string;
  product: string;
  network: "visa" | "mastercard" | "amex" | "discover";
  annualFeeCents: number;
  fxFeePct: number;
  baseRate: number;
  currency: string;
  colorFrom: string;
  colorTo: string;
  sourceUrl: string;
  notes?: string;
  rules: RuleSeed[];
};

const CURRENCIES = [
  {
    code: "USD",
    name: "Cash back",
    defaultCpp: 1,
    userCpp: 1,
    isCashback: true,
    notes: "Statement credit, always worth exactly one cent.",
  },
  {
    code: "UR",
    name: "Chase Ultimate Rewards",
    defaultCpp: 1,
    userCpp: 1.7,
    isCashback: false,
    notes: "1.0c as cash, 1.25-1.5c through Chase Travel, ~1.7-2.1c via transfer partners.",
  },
  {
    code: "MR",
    name: "Amex Membership Rewards",
    defaultCpp: 0.6,
    userCpp: 1.8,
    isCashback: false,
    notes: "Only 0.6c if you cash out. The whole value is in airline transfer partners.",
  },
  {
    code: "TYP",
    name: "Citi ThankYou Points",
    defaultCpp: 1,
    userCpp: 1.6,
    isCashback: false,
    notes: "1.0c as cash, more via transfer partners.",
  },
  {
    code: "C1",
    name: "Capital One Miles",
    defaultCpp: 1,
    userCpp: 1.4,
    isCashback: false,
    notes: "1.0c against travel purchases, ~1.4-1.7c via transfer partners.",
  },
];

const CARDS: CardSeed[] = [
  {
    slug: "chase-sapphire-preferred",
    issuer: "Chase",
    product: "Sapphire Preferred",
    network: "visa",
    annualFeeCents: 9500,
    fxFeePct: 0,
    baseRate: 1,
    currency: "UR",
    colorFrom: "#1e3a5f",
    colorTo: "#0b1c30",
    sourceUrl: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    rules: [
      { label: "Chase Travel bookings", rate: 5, merchantSlugs: ["chase-travel"], priority: 10 },
      { label: "Dining", rate: 3, mccCodes: MCC.RESTAURANTS },
      { label: "Select streaming", rate: 3, mccCodes: MCC.STREAMING },
      {
        label: "Online groceries",
        rate: 3,
        merchantSlugs: ["instacart", "amazon-fresh"],
        notes: "Excludes Target, Walmart and wholesale clubs.",
      },
      { label: "Other travel", rate: 2, mccCodes: MCC_TRAVEL_BROAD },
    ],
  },
  {
    slug: "chase-freedom-unlimited",
    issuer: "Chase",
    product: "Freedom Unlimited",
    network: "visa",
    annualFeeCents: 0,
    fxFeePct: 3,
    baseRate: 1.5,
    currency: "UR",
    colorFrom: "#0f3d3e",
    colorTo: "#07201f",
    sourceUrl: "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited",
    rules: [
      { label: "Chase Travel bookings", rate: 5, merchantSlugs: ["chase-travel"], priority: 10 },
      { label: "Dining", rate: 3, mccCodes: MCC.RESTAURANTS },
      { label: "Drugstores", rate: 3, mccCodes: MCC.DRUGSTORES },
    ],
  },
  {
    slug: "chase-freedom-flex",
    issuer: "Chase",
    product: "Freedom Flex",
    network: "mastercard",
    annualFeeCents: 0,
    fxFeePct: 3,
    baseRate: 1,
    currency: "UR",
    colorFrom: "#3b2f63",
    colorTo: "#1b1430",
    sourceUrl: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
    rules: [
      {
        label: "Rotating 5% category",
        rate: 5,
        mccCodes: [...MCC.GAS, ...MCC.STREAMING],
        capAmountCents: 150000,
        capPeriod: "quarter",
        requiresActivation: true,
        validFrom: "2026-07-01",
        validTo: "2026-09-30",
        priority: 20,
        notes:
          "Placeholder categories. Check this quarter's actual rotation at chase.com and edit before relying on it.",
        unverified: true,
      },
      { label: "Chase Travel bookings", rate: 5, merchantSlugs: ["chase-travel"], priority: 10 },
      { label: "Dining", rate: 3, mccCodes: MCC.RESTAURANTS },
      { label: "Drugstores", rate: 3, mccCodes: MCC.DRUGSTORES },
    ],
  },
  {
    slug: "amex-gold",
    issuer: "American Express",
    product: "Gold Card",
    network: "amex",
    annualFeeCents: 32500,
    fxFeePct: 0,
    baseRate: 1,
    currency: "MR",
    colorFrom: "#b58e3f",
    colorTo: "#6b4f18",
    sourceUrl: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    rules: [
      {
        label: "Restaurants worldwide",
        rate: 4,
        mccCodes: MCC.RESTAURANTS,
        capAmountCents: 5000000,
        capPeriod: "year",
      },
      {
        label: "US supermarkets",
        rate: 4,
        mccCodes: MCC.GROCERY,
        capAmountCents: 2500000,
        capPeriod: "year",
        notes: "Excludes superstores and warehouse clubs such as Walmart, Target and Costco.",
      },
      {
        label: "Flights booked direct or via Amex Travel",
        rate: 3,
        mccCodes: MCC.AIRLINES,
        merchantSlugs: ["amex-travel"],
      },
    ],
  },
  {
    slug: "amex-blue-cash-preferred",
    issuer: "American Express",
    product: "Blue Cash Preferred",
    network: "amex",
    annualFeeCents: 9500,
    fxFeePct: 2.7,
    baseRate: 1,
    currency: "USD",
    colorFrom: "#1c4fa1",
    colorTo: "#0c2350",
    sourceUrl: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/",
    rules: [
      {
        label: "US supermarkets",
        rate: 6,
        mccCodes: MCC.GROCERY,
        capAmountCents: 600000,
        capPeriod: "year",
        notes: "Drops to 1% once you pass $6,000 of grocery spend in a calendar year.",
      },
      { label: "Select US streaming", rate: 6, mccCodes: MCC.STREAMING },
      { label: "US gas stations", rate: 3, mccCodes: MCC.GAS },
      { label: "Transit", rate: 3, mccCodes: MCC.TRANSIT },
    ],
  },
  {
    slug: "citi-custom-cash",
    issuer: "Citi",
    product: "Custom Cash",
    network: "mastercard",
    annualFeeCents: 0,
    fxFeePct: 3,
    baseRate: 1,
    currency: "TYP",
    colorFrom: "#0b4f6c",
    colorTo: "#052534",
    sourceUrl: "https://www.citi.com/credit-cards/citi-custom-cash-credit-card",
    notes: "Earns 5x in one category per billing cycle only. Pick which one in Settings.",
    rules: (
      [
        ["Restaurants", MCC.RESTAURANTS],
        ["Gas stations", MCC.GAS],
        ["Grocery stores", MCC.GROCERY],
        ["Select transit", MCC.TRANSIT],
        ["Select travel", MCC_TRAVEL_BROAD],
        ["Select streaming", MCC.STREAMING],
        ["Drugstores", MCC.DRUGSTORES],
        ["Home improvement", MCC.HOME_IMPROVEMENT],
        ["Fitness clubs", MCC.FITNESS],
        ["Live entertainment", MCC.ENTERTAINMENT],
      ] as const
    ).map(([label, mccCodes]) => ({
      label: `5x: ${label}`,
      rate: 5,
      mccCodes: [...mccCodes],
      capAmountCents: 50000,
      capPeriod: "month" as const,
      selectionGroup: "citi-custom-cash-category",
      notes: "Only the single selected category earns 5x, on the first $500 each cycle.",
    })),
  },
  {
    slug: "capital-one-savor",
    issuer: "Capital One",
    product: "Savor",
    network: "mastercard",
    annualFeeCents: 0,
    fxFeePct: 0,
    baseRate: 1,
    currency: "USD",
    colorFrom: "#8c1d2f",
    colorTo: "#3f0a14",
    sourceUrl: "https://www.capitalone.com/credit-cards/savor-dining-rewards/",
    rules: [
      { label: "Capital One Entertainment", rate: 8, merchantSlugs: ["capital-one-entertainment"], priority: 20 },
      {
        label: "Hotels and rental cars via Capital One Travel",
        rate: 5,
        merchantSlugs: ["capital-one-travel"],
        priority: 10,
      },
      { label: "Dining", rate: 3, mccCodes: MCC.RESTAURANTS },
      { label: "Entertainment", rate: 3, mccCodes: MCC.ENTERTAINMENT },
      { label: "Popular streaming", rate: 3, mccCodes: MCC.STREAMING },
      {
        label: "Grocery stores",
        rate: 3,
        mccCodes: MCC.GROCERY,
        notes: "Excludes superstores such as Walmart and Target.",
      },
    ],
  },
  {
    slug: "capital-one-venture-x",
    issuer: "Capital One",
    product: "Venture X",
    network: "visa",
    annualFeeCents: 39500,
    fxFeePct: 0,
    baseRate: 2,
    currency: "C1",
    colorFrom: "#2b2b2b",
    colorTo: "#0a0a0a",
    sourceUrl: "https://www.capitalone.com/credit-cards/venture-x/",
    notes: "$300 annual travel credit through Capital One Travel offsets most of the fee.",
    rules: [
      {
        label: "Hotels and rental cars via Capital One Travel",
        rate: 10,
        merchantSlugs: ["capital-one-travel"],
        priority: 20,
      },
      {
        label: "Flights and vacation rentals via Capital One Travel",
        rate: 5,
        merchantSlugs: ["capital-one-travel"],
        priority: 10,
      },
    ],
  },
  {
    slug: "discover-it-cash-back",
    issuer: "Discover",
    product: "it Cash Back",
    network: "discover",
    annualFeeCents: 0,
    fxFeePct: 0,
    baseRate: 1,
    currency: "USD",
    colorFrom: "#e07b25",
    colorTo: "#8a3f06",
    sourceUrl: "https://www.discover.com/credit-cards/cash-back/it-card.html",
    rules: [
      {
        label: "Rotating 5% category",
        rate: 5,
        mccCodes: [...MCC.GROCERY, ...MCC.RESTAURANTS],
        capAmountCents: 150000,
        capPeriod: "quarter",
        requiresActivation: true,
        validFrom: "2026-07-01",
        validTo: "2026-09-30",
        priority: 20,
        notes:
          "Placeholder categories. Check this quarter's actual rotation at discover.com and edit before relying on it.",
        unverified: true,
      },
    ],
  },
  {
    slug: "costco-anywhere-visa",
    issuer: "Citi",
    product: "Costco Anywhere Visa",
    network: "visa",
    annualFeeCents: 0,
    fxFeePct: 0,
    baseRate: 1,
    currency: "USD",
    colorFrom: "#004b87",
    colorTo: "#00243f",
    sourceUrl: "https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card",
    notes: "No annual fee, but requires a paid Costco membership. Rewards pay out once a year.",
    rules: [
      {
        label: "Gas and EV charging",
        rate: 5,
        mccCodes: [...MCC.GAS, ...MCC.EV_CHARGING],
        capAmountCents: 700000,
        capPeriod: "year",
        notes: "Includes Costco gas. Drops to 1% after $7,000 of fuel spend per year.",
      },
      { label: "Restaurants and eligible travel", rate: 3, mccCodes: [...MCC.RESTAURANTS, ...MCC_TRAVEL_BROAD] },
      { label: "Costco and Costco.com", rate: 2, merchantSlugs: ["costco", "costco-online"] },
    ],
  },
  {
    slug: "citi-double-cash",
    issuer: "Citi",
    product: "Double Cash",
    network: "mastercard",
    annualFeeCents: 0,
    fxFeePct: 3,
    baseRate: 2,
    currency: "USD",
    colorFrom: "#404b57",
    colorTo: "#1a2129",
    sourceUrl: "https://www.citi.com/credit-cards/citi-double-cash-credit-card",
    notes: "Flat 2% everywhere: 1% when you buy, 1% when you pay it off. The floor to beat.",
    rules: [],
  },
];

type MerchantSeed = {
  slug: string;
  name: string;
  mcc: number;
  category: string;
  aliases?: string[];
  networkExclusions?: string[];
  codingNote?: string;
};

const MERCHANTS: MerchantSeed[] = [
  { slug: "mcdonalds", name: "McDonald's", mcc: 5814, category: "Fast food", aliases: ["mcd", "mickey ds", "macdonalds"] },
  { slug: "starbucks", name: "Starbucks", mcc: 5814, category: "Coffee", aliases: ["sbux"] },
  { slug: "chipotle", name: "Chipotle", mcc: 5814, category: "Fast food" },
  { slug: "subway", name: "Subway", mcc: 5814, category: "Fast food" },
  { slug: "taco-bell", name: "Taco Bell", mcc: 5814, category: "Fast food" },
  { slug: "dunkin", name: "Dunkin'", mcc: 5814, category: "Coffee", aliases: ["dunkin donuts"] },
  { slug: "panera", name: "Panera Bread", mcc: 5814, category: "Fast casual" },
  { slug: "chick-fil-a", name: "Chick-fil-A", mcc: 5814, category: "Fast food" },
  { slug: "olive-garden", name: "Olive Garden", mcc: 5812, category: "Restaurant" },
  { slug: "cheesecake-factory", name: "The Cheesecake Factory", mcc: 5812, category: "Restaurant" },
  {
    slug: "doordash",
    name: "DoorDash",
    mcc: 5812,
    category: "Food delivery",
    codingNote: "Codes as a restaurant, so dining bonuses apply to the whole order including fees.",
  },
  {
    slug: "uber-eats",
    name: "Uber Eats",
    mcc: 5812,
    category: "Food delivery",
    codingNote: "Codes as a restaurant, not as rideshare, even though it shares an app with Uber.",
  },
  { slug: "uber", name: "Uber", mcc: 4121, category: "Rideshare" },
  { slug: "lyft", name: "Lyft", mcc: 4121, category: "Rideshare" },

  { slug: "whole-foods", name: "Whole Foods Market", mcc: 5411, category: "Grocery" },
  { slug: "trader-joes", name: "Trader Joe's", mcc: 5411, category: "Grocery" },
  { slug: "kroger", name: "Kroger", mcc: 5411, category: "Grocery" },
  { slug: "safeway", name: "Safeway", mcc: 5411, category: "Grocery" },
  { slug: "publix", name: "Publix", mcc: 5411, category: "Grocery" },
  { slug: "aldi", name: "Aldi", mcc: 5411, category: "Grocery" },
  { slug: "instacart", name: "Instacart", mcc: 5411, category: "Grocery delivery" },
  { slug: "amazon-fresh", name: "Amazon Fresh", mcc: 5411, category: "Grocery delivery" },
  {
    slug: "target",
    name: "Target",
    mcc: 5310,
    category: "Discount store",
    codingNote:
      "Codes as a discount store, never as a grocery store, so supermarket bonuses do not apply. The in-store Starbucks codes as Target too.",
  },
  {
    slug: "walmart",
    name: "Walmart",
    mcc: 5310,
    category: "Discount store",
    codingNote:
      "Supercenters code as a discount store; standalone Neighborhood Markets often code as grocery (5411). Amex excludes Walmart from US supermarket bonuses either way.",
  },
  {
    slug: "costco",
    name: "Costco",
    mcc: 5300,
    category: "Warehouse club",
    networkExclusions: ["amex", "mastercard", "discover"],
    codingNote: "Costco warehouses in the US accept Visa only.",
  },
  { slug: "costco-online", name: "Costco.com", mcc: 5300, category: "Warehouse club" },
  {
    slug: "costco-gas",
    name: "Costco Gas Station",
    mcc: 5542,
    category: "Gas",
    networkExclusions: ["amex", "mastercard", "discover"],
    codingNote:
      "The fuel pumps code as an automated fuel dispenser (5542), not a warehouse club, so gas bonuses apply here even though the warehouse next door is excluded.",
  },
  { slug: "sams-club", name: "Sam's Club", mcc: 5300, category: "Warehouse club" },
  {
    slug: "amazon",
    name: "Amazon",
    mcc: 5999,
    category: "Online retail",
    aliases: ["amazon.com"],
    codingNote: "Codes as general merchandise, so grocery bonuses never apply even for pantry items.",
  },

  { slug: "shell", name: "Shell", mcc: 5542, category: "Gas" },
  { slug: "chevron", name: "Chevron", mcc: 5542, category: "Gas" },
  { slug: "exxon", name: "Exxon", mcc: 5542, category: "Gas", aliases: ["exxonmobil", "mobil"] },
  { slug: "bp", name: "BP", mcc: 5542, category: "Gas" },
  {
    slug: "7-eleven",
    name: "7-Eleven",
    mcc: 5541,
    category: "Convenience",
    codingNote: "Locations with pumps code as a service station (5541); those without often code as 5499 instead.",
  },
  { slug: "tesla-supercharger", name: "Tesla Supercharger", mcc: 5552, category: "EV charging" },

  { slug: "cvs", name: "CVS Pharmacy", mcc: 5912, category: "Drugstore" },
  { slug: "walgreens", name: "Walgreens", mcc: 5912, category: "Drugstore" },
  { slug: "rite-aid", name: "Rite Aid", mcc: 5912, category: "Drugstore" },

  { slug: "home-depot", name: "The Home Depot", mcc: 5200, category: "Home improvement" },
  { slug: "lowes", name: "Lowe's", mcc: 5200, category: "Home improvement" },
  { slug: "best-buy", name: "Best Buy", mcc: 5732, category: "Electronics" },
  { slug: "apple-store", name: "Apple Store", mcc: 5732, category: "Electronics" },

  { slug: "netflix", name: "Netflix", mcc: 4899, category: "Streaming" },
  { slug: "spotify", name: "Spotify", mcc: 5815, category: "Streaming" },
  { slug: "hulu", name: "Hulu", mcc: 4899, category: "Streaming" },
  { slug: "youtube-premium", name: "YouTube Premium", mcc: 5815, category: "Streaming" },

  { slug: "delta", name: "Delta Air Lines", mcc: 4511, category: "Airline" },
  { slug: "united", name: "United Airlines", mcc: 4511, category: "Airline" },
  { slug: "southwest", name: "Southwest Airlines", mcc: 4511, category: "Airline" },
  { slug: "marriott", name: "Marriott", mcc: 7011, category: "Hotel" },
  { slug: "hilton", name: "Hilton", mcc: 7011, category: "Hotel" },
  {
    slug: "airbnb",
    name: "Airbnb",
    mcc: 7011,
    category: "Lodging",
    codingNote: "Codes as lodging (7011), so most hotel and broad travel bonuses do apply.",
  },
  { slug: "hertz", name: "Hertz", mcc: 7512, category: "Car rental" },
  { slug: "chase-travel", name: "Chase Travel", mcc: 4722, category: "Travel portal" },
  { slug: "capital-one-travel", name: "Capital One Travel", mcc: 4722, category: "Travel portal" },
  { slug: "amex-travel", name: "Amex Travel", mcc: 4722, category: "Travel portal" },
  { slug: "capital-one-entertainment", name: "Capital One Entertainment", mcc: 7922, category: "Ticketing" },

  { slug: "amc-theatres", name: "AMC Theatres", mcc: 7832, category: "Movie theater" },
  { slug: "ticketmaster", name: "Ticketmaster", mcc: 7922, category: "Ticketing" },
  { slug: "planet-fitness", name: "Planet Fitness", mcc: 7997, category: "Gym" },
  { slug: "equinox", name: "Equinox", mcc: 7997, category: "Gym" },
];

export async function seedDatabase(db: Db) {
  const currencyRows = await db.insert(s.pointCurrencies).values(CURRENCIES).returning();
  const currencyId = new Map(currencyRows.map((c) => [c.code, c.id]));

  const cardRows = await db
    .insert(s.cards)
    .values(
      CARDS.map((c) => ({
        slug: c.slug,
        issuer: c.issuer,
        product: c.product,
        network: c.network,
        annualFeeCents: c.annualFeeCents,
        fxFeePct: c.fxFeePct,
        baseRate: c.baseRate,
        currencyId: currencyId.get(c.currency)!,
        colorFrom: c.colorFrom,
        colorTo: c.colorTo,
        notes: c.notes ?? null,
      })),
    )
    .returning();
  const cardId = new Map(cardRows.map((c) => [c.slug, c.id]));

  const ruleValues = CARDS.flatMap((c) =>
    c.rules.map((r) => ({
      cardId: cardId.get(c.slug)!,
      label: r.label,
      mccCodes: r.mccCodes ?? [],
      merchantSlugs: r.merchantSlugs ?? [],
      rate: r.rate,
      capAmountCents: r.capAmountCents ?? null,
      capPeriod: r.capPeriod ?? "none",
      requiresActivation: r.requiresActivation ?? false,
      selectionGroup: r.selectionGroup ?? null,
      validFrom: r.validFrom ?? null,
      validTo: r.validTo ?? null,
      priority: r.priority ?? 0,
      sourceUrl: c.sourceUrl,
      verifiedAt: r.unverified ? null : SEEDED_AT,
      notes: r.notes ?? null,
    })),
  );
  if (ruleValues.length > 0) {
    await db.insert(s.earnRules).values(ruleValues);
  }

  await db.insert(s.merchants).values(
    MERCHANTS.map((m) => ({
      slug: m.slug,
      name: m.name,
      aliases: m.aliases ?? [],
      mcc: m.mcc,
      category: m.category,
      networkExclusions: m.networkExclusions ?? [],
      issuerOverrides: {},
      source: "seed",
      codingNote: m.codingNote ?? null,
    })),
  );

  // The wallet is left empty on purpose. Everything above is a catalogue to pick
  // from; a recommendation is only ever useful if it names a card you can pull out,
  // so nothing counts as yours until you add it.
  return {
    currencies: currencyRows.length,
    cards: cardRows.length,
    rules: ruleValues.length,
    merchants: MERCHANTS.length,
    userCards: 0,
  };
}
