function clip(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}

function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return false;
  return true;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!isPublicHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.slice(0, 8);
}

const WEB_SEARCH_URL = "https://api.langsearch.com/v1/web-search";
const RERANK_URL = "https://api.langsearch.com/v1/rerank";
const RERANK_MODEL = "langsearch-reranker-v1";

export type LangSearchPage = {
  name: string;
  url: string;
  snippet: string;
  summary: string;
};

export function isLangSearchConfigured(): boolean {
  return Boolean(process.env.LANGSEARCH_API_KEY?.trim());
}

export function parseLangSearchPages(payload: unknown): LangSearchPage[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const webPages = data.webPages && typeof data.webPages === "object" ? (data.webPages as Record<string, unknown>) : null;
  const values = Array.isArray(webPages?.value) ? webPages.value : Array.isArray(root.value) ? root.value : [];

  const pages: LangSearchPage[] = [];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url || !isPublicHttpUrl(url)) continue;
    pages.push({
      name: typeof row.name === "string" ? row.name.trim() : "",
      url,
      snippet: typeof row.snippet === "string" ? row.snippet.replace(/\s+/g, " ").trim() : "",
      summary: typeof row.summary === "string" ? row.summary.replace(/\s+/g, " ").trim() : "",
    });
  }
  return pages;
}

export function parseRerankIndexes(payload: unknown): number[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const indexes: number[] = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const index = (item as { index?: unknown }).index;
    if (typeof index === "number" && Number.isInteger(index) && index >= 0) indexes.push(index);
  }
  return indexes;
}

export function orderByRerankIndexes<T>(items: T[], indexes: number[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const i of indexes) {
    if (i < 0 || i >= items.length || seen.has(i)) continue;
    seen.add(i);
    out.push(items[i]!);
  }
  for (let i = 0; i < items.length; i++) {
    if (!seen.has(i)) out.push(items[i]!);
  }
  return out;
}

export function factsFromLangSearchPages(pages: LangSearchPage[], maxChars = 1800): { text: string; sources: string[] } {
  const sources = uniqueUrls(pages.map((page) => page.url));
  const blocks = pages.map((page) => {
    const body = page.summary || page.snippet;
    if (!body) return page.name;
    return page.name ? `${page.name}: ${body}` : body;
  }).filter(Boolean);
  return {
    text: clip(blocks.join("\n\n"), maxChars),
    sources,
  };
}

export function pageDocuments(pages: LangSearchPage[]): string[] {
  return pages.map((page) => {
    const body = (page.summary || page.snippet).slice(0, 1200);
    return [page.name, body].filter(Boolean).join(". ");
  });
}

async function langSearchPost(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const key = process.env.LANGSEARCH_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  return res.json() as Promise<unknown>;
}

export async function langSearchWeb(query: string, count = 5): Promise<LangSearchPage[]> {
  if (!isLangSearchConfigured()) return [];
  try {
    const payload = await langSearchPost(
      WEB_SEARCH_URL,
      { query, freshness: "noLimit", summary: false, count },
      6_000,
    );
    return parseLangSearchPages(payload);
  } catch {
    return [];
  }
}

export async function langSearchRerank(query: string, pages: LangSearchPage[], topN = 5): Promise<LangSearchPage[]> {
  if (pages.length < 2 || !isLangSearchConfigured()) return pages;
  const documents = pageDocuments(pages);
  if (documents.every((doc) => !doc.trim())) return pages;
  try {
    const payload = await langSearchPost(
      RERANK_URL,
      {
        model: RERANK_MODEL,
        query,
        top_n: Math.min(topN, pages.length),
        return_documents: false,
        documents,
      },
      8_000,
    );
    const indexes = parseRerankIndexes(payload);
    if (!indexes.length) return pages;
    return orderByRerankIndexes(pages, indexes).slice(0, topN);
  } catch {
    return pages.slice(0, topN);
  }
}

export async function searchWithLangSearch(
  query: string,
  _rerankQuery?: string,
): Promise<{ text: string; sources: string[] } | null> {
  const pages = await langSearchWeb(query);
  if (!pages.length) return null;
  const facts = factsFromLangSearchPages(pages.slice(0, 5));
  if (!facts.text && facts.sources.length === 0) return null;
  return facts;
}
