/**
 * Pure merchant matching, kept free of database and SDK imports so the browser
 * can run the same logic against a cached snapshot when the network is gone.
 */

export type MatchableMerchant = {
  name: string;
  slug: string;
  aliases: string[];
};

/*
 * People type "I'm at McDonald's", not "McDonald's". Both halves of the filler
 * are stripped separately and repeatedly. The word boundaries matter: without
 * them "in-n-out" loses its "in" and "ikea" loses its "i".
 */
const PRONOUN = /^i\s*(?:'m|’m|m|am)?\b\s*/i;
const PREPOSITION = /^(?:at|buying|shopping|paying|purchasing)\s+(?:at\s+)?/i;
const BARE_FILLER = /^(?:at|in|i|im|am)$/i;

export function normalizeQuery(input: string): string {
  let q = input.trim().toLowerCase();
  let previous: string;
  do {
    previous = q;
    q = q.replace(PRONOUN, "").replace(PREPOSITION, "").trim();
  } while (q !== previous);

  q = q
    .replace(/[^a-z0-9\s'&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return BARE_FILLER.test(q) ? "" : q;
}

function canonical(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when `alias` can reasonably refer to `name` (prefix, contained word, or
 * shared opening). False for coincidental letter overlap — "swagath" is not
 * Southwest, "mayuri" is not "May".
 */
export function isPlausibleAlias(alias: string, name: string): boolean {
  const a = canonical(alias);
  const b = canonical(name);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a) || a.startsWith(b)) {
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length < 4 && longer.length - shorter.length >= 3 && !longer.startsWith(shorter)) {
      return false;
    }
    if (a.startsWith(b) && b.length < 4 && a.length >= 6) return false;
    return true;
  }
  if (a.length >= 4 && b.includes(a)) return true;
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true;
  return false;
}

/** Higher is better. 100 is an exact name, slug or plausible alias hit. */
export function matchScore(merchant: MatchableMerchant, query: string): number {
  const q = canonical(query);
  if (!q) return 0;

  const nameCanon = canonical(merchant.name);
  const slugCanon = canonical(merchant.slug);
  const aliasCanons = merchant.aliases.map(canonical);

  if (nameCanon === q || slugCanon === q) return 100;
  if (aliasCanons.includes(q) && isPlausibleAlias(q, merchant.name)) return 100;

  const prefixHit =
    (q.length >= 3 && (nameCanon.startsWith(q) || slugCanon.startsWith(q))) ||
    aliasCanons.some((h) => q.length >= 3 && h.startsWith(q) && isPlausibleAlias(q, merchant.name));
  if (prefixHit) {
    return 85 - Math.min(10, Math.abs(nameCanon.length - q.length));
  }

  if (q.length >= 3 && (nameCanon.includes(q) || slugCanon.includes(q))) return 65;
  if (nameCanon.length >= 4 && q.includes(nameCanon) && isPlausibleAlias(q, merchant.name)) return 70;

  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const nameTokens = merchant.name.toLowerCase().split(/\s+/).filter(Boolean);
  const overlap = queryTokens.filter((t) => nameTokens.some((n) => n.startsWith(t) && t.length >= 3)).length;
  if (overlap > 0) return 40 * (overlap / Math.max(queryTokens.length, nameTokens.length));

  return 0;
}

/** Confidence at which a local hit is trusted and the model is skipped. */
export const CONFIDENT_MATCH = 80;

export function displayMerchantName(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function bestMatch<T extends MatchableMerchant>(
  merchants: T[],
  query: string,
): { merchant: T; score: number } | null {
  let best: { merchant: T; score: number } | null = null;
  for (const merchant of merchants) {
    const score = matchScore(merchant, query);
    if (!best || score > best.score) best = { merchant, score };
  }
  return best;
}
