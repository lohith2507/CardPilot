import { GroqNotConfiguredError, GroqRateLimitError, searchCompletion } from "@/lib/groq";
import { isLangSearchConfigured, searchWithLangSearch } from "@/lib/langsearch";
import { extractUrls, htmlToText, isPublicHttpUrl, rankSources } from "@/lib/lookup";

export type MerchantWebFacts = {
  text: string;
  sources: string[];
};

const SEARCH_SYSTEM =
  "Describe this merchant in 2-3 factual sentences: what kind of business it is, city or neighborhood if known, and what it is known for. Then note the merchant category code (MCC) credit cards usually see. Encyclopedic tone, under 90 words. Do not invent a famous chain with a similar spelling.";

export function merchantSearchQuery(name: string): string {
  const trimmed = name.trim();
  return `"${trimmed}" grocery OR restaurant OR supermarket OR store MCC`;
}

export function clipFacts(text: string, max = 1800): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}

/** Keep the first few sentences for the search-overview UI. */
export function clipToSentences(text: string, maxSentences = 3, maxChars = 320): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const parts = collapsed.match(/[^.!?]+[.!?]+/g);
  if (!parts?.length) {
    return collapsed.length <= maxChars ? collapsed : `${collapsed.slice(0, maxChars).trim()}…`;
  }

  let out = "";
  for (let i = 0; i < Math.min(maxSentences, parts.length); i++) {
    const next = parts[i]!.trim();
    if (out.length + next.length + 1 > maxChars && out.length > 0) break;
    out = out ? `${out} ${next}` : next;
  }
  return out.trim();
}

const JUNK_SNIPPET =
  /cookie|privacy policy|terms of (use|service)|sign in|log in|add to cart|subscribe|newsletter|all rights reserved|grocery or restaurant or supermarket|\bor\s+restaurant\s+or\s+store\b|click here|javascript required|enable cookies|dirección|mariscos|asiático|\+\s*61|\+\s*1\d{10}|hours?\s+menu|menu\s+reviews?/i;

const PLACE_WORD =
  /\b(grocery|grocer|supermarket|restaurant|cafe|coffee|bakery|market|store|shop|gas|petrol|pharmacy|hotel|motel|airline|warehouse|salon|barber|gym|theatre|theater|cinema|bar|pub|bistro|deli|pizzeria|takeaway|take-out|fast food|electronics|apparel|clothing|indian|chinese|mexican|thai|sushi|dining)\b/i;

const PLACE_VERB = /\b(is|are|was|were|serves|sells|offers|located|specializ(?:e|es|ing)|known|operates)\b/i;

/** Words too common to prove the snippet is about this merchant. */
const WEAK_NAME_TOKENS = new Set([
  "the",
  "and",
  "for",
  "restaurant",
  "cafe",
  "market",
  "store",
  "shop",
  "food",
  "kitchen",
  "grill",
  "house",
  "place",
]);

function sentenceCase(text: string): string {
  const trimmed = text
    .replace(/\s+/g, " ")
    .replace(/\s*#\s*\d+\s*/g, " ")
    .replace(/\s*[-–—,:;]\s*/g, (m) => (m.includes(",") ? ", " : ": "))
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[-–—,:;\s]+/, "");
  if (!trimmed) return "";
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  const lowerShare = letters
    ? [...letters].filter((ch) => ch === ch.toLowerCase()).length / letters.length
    : 0;
  const body = lowerShare > 0.8 ? trimmed.toLowerCase() : trimmed;
  const capped = body.charAt(0).toUpperCase() + body.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function splitFactBlocks(text: string): string[] {
  const chunks: string[] = [];
  for (const block of text.split(/\n+/)) {
    const title = block.includes(" — ") ? block.slice(0, block.indexOf(" — ")).trim() : "";
    const stripped = block.includes(" — ") ? block.slice(block.indexOf(" — ") + 3) : block;
    // Prefer title+body when the title names the place; otherwise body alone.
    const candidates = [stripped, title ? `${title}. ${stripped}` : ""].filter(Boolean);
    for (const candidate of candidates) {
      const sentences = candidate.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [candidate];
      for (const sentence of sentences) {
        const clean = sentence.replace(/\s+/g, " ").trim();
        if (clean) chunks.push(clean);
      }
    }
  }
  return chunks;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !WEAK_NAME_TOKENS.has(t));
}

function mentionsName(text: string, name: string): boolean {
  const hay = text.toLowerCase();
  const needle = name.trim().toLowerCase();
  if (needle.length >= 3 && hay.includes(needle)) return true;
  const tokens = nameTokens(name);
  if (!tokens.length) return false;
  // Require the distinctive brand token (first strong token), not a weak place word alone.
  const brand = tokens[0]!;
  if (!hay.includes(brand)) return false;
  // If the user typed a multi-word name, prefer at least one more token (city/cuisine/etc.).
  if (tokens.length === 1) return true;
  return tokens.slice(1).some((t) => hay.includes(t));
}

function looksLikeAddressDump(text: string): boolean {
  const commas = (text.match(/,/g) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  if (commas >= 4 && digits >= 6) return true;
  if (/\b(wa|nsw|qld|vic)\s*,?\s*\d{4}\b/i.test(text)) return true;
  if (/\+\s*\d[\d\s-]{8,}/.test(text)) return true;
  if (/#\s*\d+\s*-/.test(text)) return true;
  return false;
}

function isUsefulFact(text: string, name: string): boolean {
  if (text.length < 24 || text.length > 220) return false;
  if (JUNK_SNIPPET.test(text)) return false;
  if (/^https?:/i.test(text)) return false;
  if ((text.match(/\bOR\b/g) ?? []).length >= 2) return false;
  if (looksLikeAddressDump(text)) return false;
  if (!mentionsName(text, name)) return false;
  return PLACE_WORD.test(text) || PLACE_VERB.test(text);
}

/** Pull one readable sentence that is clearly about this merchant. */
export function overviewFromWebFacts(name: string, text: string, maxChars = 180): string {
  const seen = new Set<string>();
  for (const raw of splitFactBlocks(text)) {
    if (!isUsefulFact(raw, name)) continue;
    let sentence = sentenceCase(raw);
    // Drop leading noise like "Yelp: " once more after casing.
    sentence = sentence.replace(/^(?:yelp|google|tripadvisor|facebook|instagram)\s*[—:\-]\s*/i, "");
    if (!mentionsName(sentence, name)) {
      sentence = `${name.trim()}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
    }
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    if (sentence.length > maxChars) {
      sentence = `${sentence.slice(0, maxChars - 1).trim()}…`;
    }
    return sentence;
  }
  return "";
}

function friendlyCategoryLine(name: string, category: string, mcc: number, mccLabelText: string): string {
  const label = (category.trim() || mccLabelText).toLowerCase();
  const article = /^[aeiou]/.test(label) ? "an" : "a";
  return `${name} is ${article} ${label}. Card networks usually see this as MCC ${mcc} (${mccLabelText}).`;
}

export type MerchantBlurb = {
  summary: string;
  /** Phrase to highlight in the overview (usually the business category). */
  highlight: string;
  sources: string[];
};

export function buildMerchantBlurb(
  name: string,
  category: string,
  mcc: number,
  mccLabelText: string,
  facts?: MerchantWebFacts | null,
): MerchantBlurb {
  const highlight = category.trim() || mccLabelText;
  const raw = facts?.text?.trim();
  const web = raw ? overviewFromWebFacts(name, raw) : "";

  if (web) {
    const sources = (facts?.sources ?? []).slice(0, 4);
    const summary = clipToSentences(
      `${web} Card networks usually see this as MCC ${mcc} (${mccLabelText}).`,
      3,
      280,
    );
    return { summary, highlight, sources };
  }

  return {
    summary: friendlyCategoryLine(name, category, mcc, mccLabelText),
    highlight,
    // Unrelated SERP links are worse than none when we could not trust the text.
    sources: [],
  };
}

export function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    const parts = host.split(".");
    if (parts.length >= 2) return parts.slice(-2).join(".");
    return host;
  } catch {
    return url.length > 28 ? `${url.slice(0, 25)}…` : url;
  }
}

export function buildResolutionUser(query: string, facts: MerchantWebFacts): string {
  const sources = facts.sources.length > 0 ? facts.sources.join("\n") : "(none)";
  const body = facts.text.trim() || "(no web snippets)";
  return `Typed name: ${query}\n\nWeb findings:\n${clipFacts(body)}\n\nSources:\n${sources}`;
}

export async function searchMerchantWeb(name: string): Promise<MerchantWebFacts> {
  const query = name.trim();
  const langQuery = merchantSearchQuery(query);
  const ddg = searchMerchantDuckDuckGo(query);
  const lang = await searchWithLangSearch(
    langQuery,
    `What kind of business is "${query}"? Grocery, restaurant, supermarket, gas, or something else? Typical credit-card MCC if known.`,
  );
  if (lang?.text || lang?.sources.length) {
    return { text: lang.text, sources: rankSources([...lang.sources, ...extractUrls(lang.text)]) };
  }

  const scraped = await ddg;
  if (scraped.text || scraped.sources.length) return scraped;
  if (isLangSearchConfigured()) return scraped;

  try {
    const found = await searchCompletion({
      system: SEARCH_SYSTEM,
      user: `What business is "${query}"? Search the exact name. Grocery, restaurant, gas, or something else? Typical card MCC if known. Do not invent a famous chain with a similar spelling.`,
      maxTokens: 220,
    });
    return {
      text: found.text,
      sources: rankSources([...found.sources, ...extractUrls(found.text)]),
    };
  } catch (err) {
    if (!(err instanceof GroqRateLimitError) && !(err instanceof GroqNotConfiguredError)) throw err;
    return scraped;
  }
}

export async function searchMerchantDuckDuckGo(name: string): Promise<MerchantWebFacts> {
  const target = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(merchantSearchQuery(name))}`;
  try {
    const res = await fetch(target, {
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; CardPilot/0.1; merchant-lookup)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { text: "", sources: [] };
    const html = await res.text();
    const text = htmlToText(html).slice(0, 4000);
    const sources = rankSources(extractUrls(html).filter((url) => isPublicHttpUrl(url)));
    return { text, sources };
  } catch {
    return { text: "", sources: [] };
  }
}
