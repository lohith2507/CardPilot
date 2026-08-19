import { GroqNotConfiguredError, GroqRateLimitError, searchCompletion } from "@/lib/groq";
import { searchWithLangSearch } from "@/lib/langsearch";

/**
 * Looking a card up by name is two steps on purpose. Groq's search model can
 * find the issuer's page, but asking it to dump a full fact sheet used to blow
 * the free-tier token budget (413). So the search is kept tiny — "give me the
 * URL and a short rate list" — and we fetch the page ourselves, strip it to
 * text, and hand that to the same extractor that reads a paste.
 */

export type CardLookup = {
  terms: string;
  sources: string[];
};

export type LookupIO = {
  searchWeb: (name: string) => Promise<{ text: string; sources: string[] }>;
  fetchPage: (url: string) => Promise<string>;
};

const ISSUER =
  /(chase|americanexpress|amex|citi|capitalone|discover|wellsfargo|bankofamerica|usbank|barclay|hsbc)/i;

const KNOWN_PAGES: { match: RegExp; url: string }[] = [
  { match: /sapphire preferred/i, url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred" },
  { match: /freedom unlimited/i, url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited" },
  { match: /freedom flex/i, url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex" },
  { match: /freedom rise/i, url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/rise" },
  { match: /sapphire reserve/i, url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve" },
  { match: /ink business cash/i, url: "https://creditcards.chase.com/business-credit-cards/ink/cash" },
  { match: /ink business preferred/i, url: "https://creditcards.chase.com/business-credit-cards/ink/business-preferred" },
  { match: /amazon prime visa/i, url: "https://creditcards.chase.com/amazon-prime-rewards-visa" },
  { match: /amex gold|american express gold/i, url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/" },
  { match: /blue cash preferred/i, url: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/" },
  { match: /blue cash everyday/i, url: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/" },
  { match: /amex platinum|american express platinum/i, url: "https://www.americanexpress.com/us/credit-cards/card/platinum/" },
  { match: /custom cash/i, url: "https://www.citi.com/credit-cards/citi-custom-cash-credit-card" },
  { match: /double cash/i, url: "https://www.citi.com/credit-cards/citi-double-cash-credit-card" },
  { match: /savor/i, url: "https://www.capitalone.com/credit-cards/savor-dining-rewards/" },
  { match: /venture x/i, url: "https://www.capitalone.com/credit-cards/venture-x/" },
  { match: /venture(?! x)/i, url: "https://www.capitalone.com/credit-cards/venture/" },
  { match: /discover it/i, url: "https://www.discover.com/credit-cards/cash-back/it-card.html" },
];

const SEARCH_SYSTEM =
  "Find the official issuer product page for this credit card. First line: that URL. Then a short list of current earn rates: annual fee, foreign fee, base rate, and each bonus category with any cap. Under 200 words. No markdown.";

export async function lookupCardTerms(name: string, io: LookupIO = defaultIO): Promise<CardLookup> {
  const query = name.trim();
  if (query.length < 3) {
    throw new Error("Give me a bit more of the card's name to search for.");
  }
  // Issuer-only queries land on a catalogue page, and the extractor then asks
  // which card — refuse early rather than burning a model call on that.
  if (/^(chase|amex|american express|citi|capital one|discover|wells fargo|bank of america)\s*(bank|cards?)?$/i.test(query)) {
    throw new Error(
      `Which ${query} card? Type the product name too — for example "${query.includes("chase") || /^chase$/i.test(query) ? "Chase Sapphire Preferred" : `${query} Gold`}".`,
    );
  }

  const known = knownProductUrl(query);
  let searchText = "";
  let searchSources: string[] = [];

  try {
    const found = await io.searchWeb(query);
    searchText = found.text;
    searchSources = found.sources;
  } catch (err) {
    if (!(err instanceof GroqRateLimitError) && !(err instanceof GroqNotConfiguredError)) throw err;
  }

  const urls = rankSources([
    ...(known ? [known] : []),
    ...searchSources,
    ...extractUrls(searchText),
  ]).slice(0, 2);

  const pages = await Promise.all(urls.map((url) => io.fetchPage(url)));
  const pageText = pages
    .map((text, i) => (text.trim().length > 40 ? `Source: ${urls[i]}\n${text.trim()}` : ""))
    .filter(Boolean)
    .join("\n\n");

  const terms = [
    `Requested card: ${query}`,
    pageText,
    searchText,
  ]
    .filter((t) => t.trim().length > 0)
    .join("\n\n");
  if (!/earn|reward|cash back|annual fee|points|miles|bonus|categor/i.test(terms)) {
    throw new Error(
      `Nothing useful came back for "${query}". Check the name, or paste the terms from the issuer's page.`,
    );
  }

  return { terms, sources: rankSources([...urls, ...searchSources]) };
}

export function knownProductUrl(name: string): string | null {
  return KNOWN_PAGES.find((row) => row.match.test(name))?.url ?? null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|h[1-6]|li|tr|section)(\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    const url = match[0].replace(/[.,;]+$/, "");
    if (isPublicHttpUrl(url)) seen.add(url.split("#")[0]);
  }
  return [...seen];
}

export function rankSources(sources: string[]): string[] {
  const noise = /google\.|bing\.|duckduckgo\.|yahoo\.|search\?|facebook\.|twitter\./i;
  const unique: string[] = [];
  for (const url of sources) {
    if (!isPublicHttpUrl(url) || noise.test(url)) continue;
    if (!unique.includes(url)) unique.push(url);
  }
  return unique.sort((a, b) => Number(isIssuerHost(b)) - Number(isIssuerHost(a))).slice(0, 5);
}

function isIssuerHost(url: string): boolean {
  try {
    return ISSUER.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return false;
  if (host === "::1" || host.startsWith("[")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

const defaultIO: LookupIO = {
  searchWeb: searchForCard,
  fetchPage: fetchPageText,
};

async function searchForCard(name: string): Promise<{ text: string; sources: string[] }> {
  const lang = await searchWithLangSearch(
    `${name} credit card official rewards issuer`,
    `Official issuer product page and current rewards terms for the "${name}" credit card.`,
  );
  if (lang?.sources.length || lang?.text) {
    return { text: lang.text, sources: rankSources([...lang.sources, ...extractUrls(lang.text)]) };
  }

  try {
    const found = await searchCompletion({
      system: SEARCH_SYSTEM,
      user: `Official product page and current rewards terms for the "${name}" credit card.`,
      maxTokens: 280,
    });
    return { text: found.text, sources: rankSources([...found.sources, ...extractUrls(found.text)]) };
  } catch (err) {
    if (!(err instanceof GroqRateLimitError) && !(err instanceof GroqNotConfiguredError)) throw err;
    const urls = await searchDuckDuckGo(name);
    return { text: "", sources: urls };
  }
}

async function searchDuckDuckGo(name: string): Promise<string[]> {
  const target = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(`${name} credit card official rewards`)}`;
  const html = await fetchHtml(target);
  return rankSources(extractUrls(html));
}

async function fetchPageText(url: string): Promise<string> {
  const html = await fetchHtml(url);
  return htmlToText(html);
}

async function fetchHtml(url: string): Promise<string> {
  if (!isPublicHttpUrl(url)) return "";
  try {
    const res = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (compatible; CardPilot/0.1; +https://github.com/cardpilot) AppleWebKit/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml|text\/plain/i.test(type)) return "";
    const body = await res.text();
    return body.slice(0, 1_500_000);
  } catch {
    return "";
  }
}
