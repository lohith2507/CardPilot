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

/** Higher is better. 100 is an exact name, slug or alias hit. */
export function matchScore(merchant: MatchableMerchant, query: string): number {
  const q = canonical(query);
  if (!q) return 0;

  const haystacks = [merchant.name, merchant.slug, ...merchant.aliases].map(canonical);
  if (haystacks.some((h) => h === q)) return 100;
  if (haystacks.some((h) => h.startsWith(q))) {
    return 85 - Math.min(10, Math.abs(haystacks[0].length - q.length));
  }
  if (haystacks.some((h) => h.includes(q) || q.includes(h))) return 65;

  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const nameTokens = merchant.name.toLowerCase().split(/\s+/).filter(Boolean);
  const overlap = queryTokens.filter((t) => nameTokens.some((n) => n.startsWith(t))).length;
  if (overlap > 0) return 40 * (overlap / Math.max(queryTokens.length, nameTokens.length));

  return 0;
}

/** Confidence at which a local hit is trusted and the model is skipped. */
export const CONFIDENT_MATCH = 60;

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
