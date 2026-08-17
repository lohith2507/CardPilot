import { describe, expect, it } from "vitest";
import {
  buildMerchantBlurb,
  buildResolutionUser,
  clipFacts,
  clipToSentences,
  merchantSearchQuery,
  sourceLabel,
} from "./merchant-lookup";
import { defaultLookupNote } from "./merchants";
import { parseJsonObject } from "./nvidia";

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
    expect(blurb.highlight).toBe("Restaurant");
    expect(blurb.sources).toHaveLength(1);
  });

  it("falls back to a category template when there are no web facts", () => {
    const blurb = buildMerchantBlurb("McDonald's", "Fast food", 5814, "Fast food");
    expect(blurb.summary).toMatch(/McDonald's/);
    expect(blurb.summary).toMatch(/5814/);
    expect(blurb.sources).toEqual([]);
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
