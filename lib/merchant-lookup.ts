import { GroqNotConfiguredError, GroqRateLimitError, searchCompletion } from "@/lib/groq";
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
  const sources = facts?.sources?.slice(0, 4) ?? [];
  const raw = facts?.text?.trim();
  const highlight = category.trim() || mccLabelText;

  if (raw && raw.length > 40) {
    let summary = clipToSentences(raw, 3, 320);
    const namePrefix = name.trim();
    if (namePrefix && !summary.toLowerCase().includes(namePrefix.toLowerCase().slice(0, 4))) {
      summary = `${namePrefix} — ${summary}`;
    }
    return { summary, highlight, sources };
  }

  const cat = category.toLowerCase();
  return {
    summary: `${name} is a ${cat} merchant. Card networks usually see purchases as MCC ${mcc} (${mccLabelText}).`,
    highlight,
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
    return searchMerchantDuckDuckGo(query);
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
