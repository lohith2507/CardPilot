/**
 * Demo-only card art sourced from publicly reachable issuer assets.
 * When no official-looking asset is available, the UI falls back to the
 * gradient treatment so unknown or user-extracted cards still render cleanly.
 */
const DEMO_CARD_ART_BY_SLUG: Record<string, string> = {
  "amex-gold":
    "https://icm.aexp-static.com/acquisition/card-art/NUS000000174_480x304_straight_withname.png",
  "capital-one-venture-x": "https://ecm.capitalone.com/WCM/card/pages/open-graph/venture-x.png",
  "discover-it-cash-back": "https://ecm.capitalone.com/WCM/dfs-card/images/it-card-marquee.png",
  "chase-sapphire-preferred":
    "https://creditcards.chase.com/content/dam/jpmc-marketplace/site-assets/personal-card-images/sapphirepreferedproductImage.jpg",
};

export function cardArtForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return DEMO_CARD_ART_BY_SLUG[slug] ?? null;
}
