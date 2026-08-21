import { describe, expect, it } from "vitest";
import {
  factsFromLangSearchPages,
  orderByRerankIndexes,
  parseLangSearchPages,
  parseRerankIndexes,
} from "./langsearch";
import {
  buildMerchantBlurb,
  buildResolutionUser,
  clipFacts,
  clipToSentences,
  merchantSearchQuery,
  overviewFromWebFacts,
  sourceLabel,
} from "./merchant-lookup";
import { defaultLookupNote } from "./merchants";
import { parseJsonObject } from "./nvidia";

describe("langsearch result parsing", () => {
  it("reads Bing-shaped webPages.value payloads", () => {
    const pages = parseLangSearchPages({
      code: 200,
      data: {
        webPages: {
          value: [
            {
              name: "Mayuri Indian Grocery",
              url: "https://example.com/mayuri",
              snippet: "Indian grocery in the Bay Area",
              summary: "Mayuri is an Indian grocery store.",
            },
            { name: "skip", url: "not-a-url", snippet: "x" },
          ],
        },
      },
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]!.url).toBe("https://example.com/mayuri");
  });

  it("orders pages by rerank indexes without dropping leftovers", () => {
    expect(orderByRerankIndexes(["a", "b", "c"], [2, 0])).toEqual(["c", "a", "b"]);
    expect(parseRerankIndexes({ results: [{ index: 1 }, { index: 0 }] })).toEqual([1, 0]);
  });

  it("joins titles and summaries into lookup facts", () => {
    const facts = factsFromLangSearchPages([
      {
        name: "Desi Adda",
        url: "https://example.com/desi",
        snippet: "",
        summary: "Indian restaurant in Redmond.",
      },
    ]);
    expect(facts.text).toMatch(/Desi Adda/);
    expect(facts.text).toMatch(/Redmond/);
    expect(facts.sources).toEqual(["https://example.com/desi"]);
  });
});

describe("merchant web lookup helpers", () => {
  it("asks search engines for business type, not just the raw name", () => {
    expect(merchantSearchQuery("mayuri")).toContain("mayuri");
    expect(merchantSearchQuery("mayuri")).toMatch(/grocery|restaurant|MCC/i);
  });

  it("clips long snippets so the model stays inside a small prompt", () => {
    expect(clipFacts("a".repeat(50), 20).endsWith("…")).toBe(true);
    expect(clipFacts("short", 20)).toBe("short");
  });

  it("puts the typed name and web findings in the structured prompt", () => {
    const user = buildResolutionUser("mayuri", {
      text: "Mayuri is an Indian grocery store in the Bay Area.",
      sources: ["https://example.com/mayuri"],
    });
    expect(user).toContain("Typed name: mayuri");
    expect(user).toContain("Indian grocery");
    expect(user).toContain("https://example.com/mayuri");
  });

  it("keeps the first few sentences for the overview blurb", () => {
    const text =
      "Desi Adda is a popular Indian restaurant in Redmond. It specializes in South Indian street food. The menu includes biryanis and chai.";
    expect(clipToSentences(text, 2, 200)).toBe(
      "Desi Adda is a popular Indian restaurant in Redmond. It specializes in South Indian street food.",
    );
  });

  it("builds a web-backed blurb when facts exist", () => {
    const blurb = buildMerchantBlurb("Desi Adda", "Restaurant", 5812, "Restaurants", {
      text: "Desi Adda is an Indian restaurant in Redmond specializing in South Indian food.",
      sources: ["https://www.instagram.com/desi_adda"],
    });
    expect(blurb.summary).toMatch(/Desi Adda/i);
    expect(blurb.summary).toMatch(/Indian restaurant/i);
    expect(blurb.summary).toMatch(/MCC 5812/);
    expect(blurb.summary).not.toMatch(/looks like/i);
    expect(blurb.highlight).toBe("Restaurant");
    expect(blurb.sources).toHaveLength(1);
  });

  it("ignores search-junk snippets and keeps a readable overview", () => {
    const blurb = buildMerchantBlurb("Mayuri", "Grocery", 5411, "Grocery stores", {
      text: [
        "Mayuri Indian Grocery Fremont — mayuri indian grocery fremont hours menu reviews.",
        "Yelp — people also search grocery OR restaurant OR supermarket OR store MCC.",
        "Privacy Policy — we use cookies to improve your experience on this site.",
        "Bay Area Eats — Mayuri is an Indian grocery store in Fremont known for spices and snacks.",
      ].join("\n\n"),
      sources: ["https://example.com/mayuri"],
    });
    expect(blurb.summary).not.toMatch(/hours menu/i);
    expect(blurb.summary).not.toMatch(/cookies/i);
    expect(blurb.summary).not.toMatch(/ OR /);
    expect(blurb.summary).toMatch(/Indian grocery/i);
    expect(blurb.summary).toMatch(/5411/);
  });

  it("drops unrelated SERP junk instead of showing another business", () => {
    const blurb = buildMerchantBlurb("Swagath Redmond", "Specialty retail", 5999, "Specialty retail", {
      text: [
        "Miss chow's en claremont — miss chow 's - claremont # 13 - mariscos - claremont , cafés claremont quarter , shop 119 , claremont , perth , wa , 6010 , australia + 61893833371",
        "Directory — specialty retail store near you hours menu reviews",
      ].join("\n\n"),
      sources: ["https://example.com/miss-chow"],
    });
    expect(blurb.summary).not.toMatch(/Miss chow/i);
    expect(blurb.summary).not.toMatch(/claremont/i);
    expect(blurb.summary).not.toMatch(/looks like/i);
    expect(blurb.summary).toMatch(/Swagath Redmond is a specialty retail/i);
    expect(blurb.summary).toMatch(/MCC 5999/);
    expect(blurb.sources).toEqual([]);
  });

  it("falls back to a category template when there are no web facts", () => {
    const blurb = buildMerchantBlurb("McDonald's", "Fast food", 5814, "Fast food");
    expect(blurb.summary).toMatch(/McDonald's/);
    expect(blurb.summary).toMatch(/5814/);
    expect(blurb.summary).toMatch(/fast food/i);
    expect(blurb.sources).toEqual([]);
  });

  it("sentence-cases lowercase search snippets", () => {
    expect(
      overviewFromWebFacts(
        "Mayuri",
        "Local Guide — mayuri is an indian grocery store in the bay area.",
      ),
    ).toMatch(/Mayuri/i);
    expect(
      overviewFromWebFacts(
        "Mayuri",
        "Local Guide — mayuri is an indian grocery store in the bay area.",
      ),
    ).toMatch(/indian grocery store/i);
  });

  it("shortens source URLs to readable hostnames", () => {
    expect(sourceLabel("https://www.instagram.com/desi_adda")).toBe("instagram.com");
  });
});

describe("lookup humility", () => {
  it("leaves a check-the-issuer note when confidence is not high", () => {
    expect(defaultLookupNote(0.9)).toBeNull();
    expect(defaultLookupNote(0.4)).toMatch(/web lookup/i);
  });
});

describe("nvidia json parse", () => {
  it("reads a bare object or one wrapped in prose", () => {
    expect(parseJsonObject('{"mcc":5411}')).toEqual({ mcc: 5411 });
    expect(parseJsonObject('Here you go\n{"mcc":5411}\n')).toEqual({ mcc: 5411 });
  });
});
