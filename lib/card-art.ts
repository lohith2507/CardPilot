/**
 * Demo card art for the seeded catalogue. Prefer local `/public/cards`
 * assets so the add-wallet and ranking UIs always show a recognisable face
 * without depending on issuer CDNs at render time.
 */
const DEMO_CARD_ART_BY_SLUG: Record<string, string> = {
  "chase-sapphire-preferred": "/cards/chase-sapphire-preferred.jpg",
  "chase-freedom-unlimited": "/cards/chase-freedom-unlimited.svg",
  "chase-freedom-flex": "/cards/chase-freedom-flex.svg",
  "amex-gold": "/cards/amex-gold.png",
  "amex-blue-cash-preferred": "/cards/amex-blue-cash-preferred.png",
  "citi-custom-cash": "/cards/citi-custom-cash.svg",
  "citi-double-cash": "/cards/citi-double-cash.svg",
  "costco-anywhere-visa": "/cards/costco-anywhere-visa.svg",
  "capital-one-savor": "/cards/capital-one-savor.png",
  "capital-one-venture-x": "/cards/capital-one-venture-x.png",
  "discover-it-cash-back": "/cards/discover-it-cash-back.svg",
};

const DEMO_CARD_ART_ALIASES: Record<string, string> = {
  "american-express-gold-card": "amex-gold",
  "american-express-gold": "amex-gold",
  "amex-gold-card": "amex-gold",
  "american-express-blue-cash-preferred": "amex-blue-cash-preferred",
  "american-express-blue-cash-preferred-card": "amex-blue-cash-preferred",
  "chase-sapphire-preferred-card": "chase-sapphire-preferred",
  "capital-one-venture-x-card": "capital-one-venture-x",
  "capital-one-savor-card": "capital-one-savor",
  "discover-it": "discover-it-cash-back",
  "citi-costco-anywhere-visa": "costco-anywhere-visa",
  "costco-anywhere-visa-credit-card": "costco-anywhere-visa",
};

function normalizeArtKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/american express/g, "amex")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function cardArtForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const direct = DEMO_CARD_ART_BY_SLUG[slug];
  if (direct) return direct;
  const alias = DEMO_CARD_ART_ALIASES[slug];
  return alias ? DEMO_CARD_ART_BY_SLUG[alias] ?? null : null;
}

/** Resolve art when a draft only has issuer + product (slug may not match seed). */
export function cardArtForName(issuer: string, product: string, slug?: string | null): string | null {
  const fromSlug = cardArtForSlug(slug);
  if (fromSlug) return fromSlug;
  const key = normalizeArtKey(`${issuer} ${product}`);
  const alias = DEMO_CARD_ART_ALIASES[key] ?? key;
  return DEMO_CARD_ART_BY_SLUG[alias] ?? DEMO_CARD_ART_BY_SLUG[key] ?? null;
}
