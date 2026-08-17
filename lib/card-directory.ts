/**
 * Browseable product list for the add-card screen. Seeded catalogue cards
 * overlay these when present; entries without a matching DB row still appear
 * so typing "Chase" shows the whole family, not only the three we shipped with.
 */

export type DirectoryCard = {
  slug: string;
  issuer: string;
  product: string;
  network: "visa" | "mastercard" | "amex" | "discover";
  colorFrom: string;
  colorTo: string;
  /** Used when looking the card up on the web. */
  lookupName: string;
};

export const CARD_DIRECTORY: DirectoryCard[] = [
  // Chase
  {
    slug: "chase-sapphire-preferred",
    issuer: "Chase",
    product: "Sapphire Preferred",
    network: "visa",
    colorFrom: "#1e3a5f",
    colorTo: "#0b1c30",
    lookupName: "Chase Sapphire Preferred",
  },
  {
    slug: "chase-sapphire-reserve",
    issuer: "Chase",
    product: "Sapphire Reserve",
    network: "visa",
    colorFrom: "#1a1a1a",
    colorTo: "#3d3d3d",
    lookupName: "Chase Sapphire Reserve",
  },
  {
    slug: "chase-freedom-unlimited",
    issuer: "Chase",
    product: "Freedom Unlimited",
    network: "visa",
    colorFrom: "#0f3d3e",
    colorTo: "#07201f",
    lookupName: "Chase Freedom Unlimited",
  },
  {
    slug: "chase-freedom-flex",
    issuer: "Chase",
    product: "Freedom Flex",
    network: "mastercard",
    colorFrom: "#3b2f63",
    colorTo: "#1b1430",
    lookupName: "Chase Freedom Flex",
  },
  {
    slug: "chase-freedom-rise",
    issuer: "Chase",
    product: "Freedom Rise",
    network: "visa",
    colorFrom: "#1b4d3e",
    colorTo: "#0d2a22",
    lookupName: "Chase Freedom Rise",
  },
  {
    slug: "chase-ink-business-cash",
    issuer: "Chase",
    product: "Ink Business Cash",
    network: "visa",
    colorFrom: "#1f3d2a",
    colorTo: "#0d1f14",
    lookupName: "Chase Ink Business Cash",
  },
  {
    slug: "chase-ink-business-preferred",
    issuer: "Chase",
    product: "Ink Business Preferred",
    network: "visa",
    colorFrom: "#2a2a4a",
    colorTo: "#12122a",
    lookupName: "Chase Ink Business Preferred",
  },
  {
    slug: "chase-amazon-prime-visa",
    issuer: "Chase",
    product: "Amazon Prime Visa",
    network: "visa",
    colorFrom: "#232f3e",
    colorTo: "#131a24",
    lookupName: "Amazon Prime Visa Chase",
  },
  // American Express
  {
    slug: "amex-gold",
    issuer: "American Express",
    product: "Gold Card",
    network: "amex",
    colorFrom: "#b58e3f",
    colorTo: "#6b4f18",
    lookupName: "American Express Gold Card",
  },
  {
    slug: "amex-platinum",
    issuer: "American Express",
    product: "Platinum Card",
    network: "amex",
    colorFrom: "#6e6e73",
    colorTo: "#2c2c2e",
    lookupName: "American Express Platinum Card",
  },
  {
    slug: "amex-blue-cash-preferred",
    issuer: "American Express",
    product: "Blue Cash Preferred",
    network: "amex",
    colorFrom: "#1a3a6b",
    colorTo: "#0c1f3d",
    lookupName: "American Express Blue Cash Preferred",
  },
  {
    slug: "amex-blue-cash-everyday",
    issuer: "American Express",
    product: "Blue Cash Everyday",
    network: "amex",
    colorFrom: "#2a5a8c",
    colorTo: "#14324f",
    lookupName: "American Express Blue Cash Everyday",
  },
  // Citi
  {
    slug: "citi-double-cash",
    issuer: "Citi",
    product: "Double Cash",
    network: "mastercard",
    colorFrom: "#003b70",
    colorTo: "#001f3d",
    lookupName: "Citi Double Cash",
  },
  {
    slug: "citi-custom-cash",
    issuer: "Citi",
    product: "Custom Cash",
    network: "mastercard",
    colorFrom: "#8b1e3d",
    colorTo: "#4a0f20",
    lookupName: "Citi Custom Cash",
  },
  {
    slug: "costco-anywhere-visa",
    issuer: "Citi",
    product: "Costco Anywhere Visa",
    network: "visa",
    colorFrom: "#e31837",
    colorTo: "#8a0f22",
    lookupName: "Costco Anywhere Visa",
  },
  // Capital One
  {
    slug: "capital-one-savor",
    issuer: "Capital One",
    product: "Savor",
    network: "mastercard",
    colorFrom: "#d4451d",
    colorTo: "#7a2208",
    lookupName: "Capital One Savor",
  },
  {
    slug: "capital-one-venture-x",
    issuer: "Capital One",
    product: "Venture X",
    network: "visa",
    colorFrom: "#1a1a1a",
    colorTo: "#4a4a4a",
    lookupName: "Capital One Venture X",
  },
  {
    slug: "capital-one-venture",
    issuer: "Capital One",
    product: "Venture",
    network: "visa",
    colorFrom: "#2c2c2c",
    colorTo: "#0f0f0f",
    lookupName: "Capital One Venture",
  },
  // Discover
  {
    slug: "discover-it-cash-back",
    issuer: "Discover",
    product: "it Cash Back",
    network: "discover",
    colorFrom: "#ff6000",
    colorTo: "#a33c00",
    lookupName: "Discover it Cash Back",
  },
];

export type CatalogPick = {
  cardId: number;
  slug: string;
  issuer: string;
  product: string;
  network: string;
  colorFrom: string | null;
  colorTo: string | null;
  inWallet: boolean;
  annualFeeCents: number;
  baseRate: number;
  isCashback: boolean;
};

export type SearchHit = {
  slug: string;
  issuer: string;
  product: string;
  network: string;
  colorFrom: string;
  colorTo: string;
  lookupName: string;
  /** Present when this card already lives in the local catalogue. */
  cardId: number | null;
  inWallet: boolean;
  readyToAdd: boolean;
};

/** Case-insensitive match on issuer, product, or full lookup name. */
export function searchCards(query: string, catalog: CatalogPick[]): SearchHit[] {
  const q = normalizeQuery(query);
  if (q.length < 1) return [];

  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const entry of CARD_DIRECTORY) {
    if (!matchesQuery(q, entry.issuer, entry.product, entry.lookupName, entry.slug)) continue;
    const local = bySlug.get(entry.slug);
    hits.push({
      slug: entry.slug,
      issuer: local?.issuer ?? entry.issuer,
      product: local?.product ?? entry.product,
      network: local?.network ?? entry.network,
      colorFrom: local?.colorFrom ?? entry.colorFrom,
      colorTo: local?.colorTo ?? entry.colorTo,
      lookupName: entry.lookupName,
      cardId: local?.cardId ?? null,
      inWallet: local?.inWallet ?? false,
      readyToAdd: Boolean(local && !local.inWallet),
    });
    seen.add(entry.slug);
  }

  // Catalogue-only cards (not in the curated directory) still show up.
  for (const local of catalog) {
    if (seen.has(local.slug)) continue;
    if (!matchesQuery(q, local.issuer, local.product, `${local.issuer} ${local.product}`, local.slug)) {
      continue;
    }
    hits.push({
      slug: local.slug,
      issuer: local.issuer,
      product: local.product,
      network: local.network,
      colorFrom: local.colorFrom ?? "#2b3547",
      colorTo: local.colorTo ?? "#141b26",
      lookupName: `${local.issuer} ${local.product}`,
      cardId: local.cardId,
      inWallet: local.inWallet,
      readyToAdd: !local.inWallet,
    });
  }

  return hits.sort((a, b) => a.issuer.localeCompare(b.issuer) || a.product.localeCompare(b.product));
}

function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\bamex\b/g, "american express")
    .replace(/\bbofa\b/g, "bank of america")
    .replace(/\bcapo?\b/g, "capital one");
}

function matchesQuery(
  q: string,
  issuer: string,
  product: string,
  lookupName: string,
  slug: string,
): boolean {
  const hay = normalizeQuery(`${issuer} ${product} ${lookupName} ${slug.replace(/-/g, " ")}`);
  if (hay.includes(q)) return true;
  const issuerNorm = normalizeQuery(issuer);
  return issuerNorm === q || issuerNorm.startsWith(q) || q.startsWith(issuerNorm);
}
