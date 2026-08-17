import { describe, expect, it, vi } from "vitest";
import {
  extractUrls,
  htmlToText,
  isPublicHttpUrl,
  knownProductUrl,
  lookupCardTerms,
  rankSources,
} from "@/lib/lookup";

describe("htmlToText", () => {
  it("drops scripts and keeps the rewards copy", () => {
    const text = htmlToText(`
      <html><head><script>window.card={rate:99}</script><style>.x{color:red}</style></head>
      <body>
        <h1>Freedom Flex</h1>
        <p>Earn 5% cash back in rotating quarterly categories.</p>
        <p>Earn 3% on dining and drugstores, 1% on everything else.</p>
      </body></html>
    `);
    expect(text).toContain("Earn 5% cash back");
    expect(text).toContain("1% on everything else");
    expect(text).not.toContain("window.card");
    expect(text).not.toContain("color:red");
  });
});

describe("isPublicHttpUrl", () => {
  it("allows ordinary issuer pages and refuses local or private ones", () => {
    expect(isPublicHttpUrl("https://creditcards.chase.com/freedom/flex")).toBe(true);
    expect(isPublicHttpUrl("http://localhost:3000/secret")).toBe(false);
    expect(isPublicHttpUrl("http://127.0.0.1/x")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.9/x")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("extractUrls and rankSources", () => {
  it("pulls https links out of search HTML and prefers the issuer", () => {
    const html = `
      <a href="https://www.nerdwallet.com/chase-freedom-flex">review</a>
      <a href="https://creditcards.chase.com/cash-back-credit-cards/freedom/flex">official</a>
      <a href="https://google.com/search?q=flex">noise</a>
    `;
    const ranked = rankSources(extractUrls(html));
    expect(ranked[0]).toContain("creditcards.chase.com");
    expect(ranked.some((u) => u.includes("google.com"))).toBe(false);
  });
});

describe("knownProductUrl", () => {
  it("maps a typed name onto the issuer page we already know", () => {
    expect(knownProductUrl("chase sapphire preferred")).toContain("sapphire/preferred");
    expect(knownProductUrl("totally made up card")).toBeNull();
  });
});

describe("lookupCardTerms", () => {
  it("refuses an issuer-only name that would land on a catalogue page", async () => {
    await expect(lookupCardTerms("Chase")).rejects.toThrow(/Sapphire Preferred/i);
  });

  it("fetches the issuer page the search pointed at and returns that text", async () => {
    const searchWeb = vi.fn(async () => ({
      text: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
      sources: ["https://creditcards.chase.com/cash-back-credit-cards/freedom/flex"],
    }));
    const fetchPage = vi.fn(async () => "Earn 5% cash back in rotating categories, then 1%.");

    const result = await lookupCardTerms("Chase Freedom Flex", { searchWeb, fetchPage });

    expect(fetchPage).toHaveBeenCalled();
    expect(result.sources[0]).toContain("chase.com");
    expect(result.terms).toContain("Requested card: Chase Freedom Flex");
    expect(result.terms).toContain("5% cash back");
  });

  it("still returns the search notes when the issuer page comes back empty", async () => {
    const result = await lookupCardTerms("Made Up Card", {
      searchWeb: async () => ({
        text: "Issuer: Test\nBonus categories:\n- Dining: 3x | cap: none | activation: not required",
        sources: ["https://www.example.com/card"],
      }),
      fetchPage: async () => "",
    });
    expect(result.terms).toMatch(/dining/i);
  });
});
