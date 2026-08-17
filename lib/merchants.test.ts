import { describe, expect, it } from "vitest";
import { bestMatch, isPlausibleAlias, matchScore, normalizeQuery, type MatchableMerchant } from "./merchant-match";
import { expandMccCodes, inferMccCodes, parseMccList } from "./mcc";

function merchant(over: Partial<MatchableMerchant> = {}): MatchableMerchant {
  return {
    slug: "mcdonalds",
    name: "McDonald's",
    aliases: ["mcd", "macdonalds"],
    ...over,
  };
}

describe("normalizeQuery", () => {
  it("strips the way people actually type at a register", () => {
    expect(normalizeQuery("I'm at McDonald's")).toBe("mcdonald's");
    expect(normalizeQuery("im at costco")).toBe("costco");
    expect(normalizeQuery("I am at Whole Foods")).toBe("whole foods");
    expect(normalizeQuery("at Shell")).toBe("shell");
    expect(normalizeQuery("buying at Target")).toBe("target");
    expect(normalizeQuery("shopping at Best Buy")).toBe("best buy");
  });

  it("collapses punctuation and whitespace", () => {
    expect(normalizeQuery("  TRADER   JOE'S!!  ")).toBe("trader joe's");
  });

  it("returns empty for filler with no merchant", () => {
    expect(normalizeQuery("i'm at")).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("matchScore", () => {
  it("scores an exact name, slug or alias highest", () => {
    expect(matchScore(merchant(), "mcdonalds")).toBe(100);
    expect(matchScore(merchant(), "McDonald's")).toBe(100);
    expect(matchScore(merchant(), "mcd")).toBe(100);
  });

  it("still matches a partial name well enough to skip the model", () => {
    expect(matchScore(merchant(), "mcdonald")).toBeGreaterThanOrEqual(60);
  });

  it("gives an unrelated merchant nothing", () => {
    expect(matchScore(merchant(), "delta air lines")).toBe(0);
  });

  it("does not treat an unrelated name as a hit just because letters overlap", () => {
    const sw = merchant({ slug: "southwest", name: "Southwest Airlines", aliases: ["swagath"] });
    expect(matchScore(sw, "swagath")).toBe(0);
    expect(isPlausibleAlias("swagath", "Southwest Airlines")).toBe(false);
    expect(isPlausibleAlias("mcd", "McDonald's")).toBe(true);
    expect(isPlausibleAlias("mcdonald", "McDonald's")).toBe(true);
    expect(isPlausibleAlias("mayuri", "May")).toBe(false);
  });

  it("matches multi-word names on token prefixes", () => {
    const wf = merchant({ slug: "whole-foods", name: "Whole Foods Market", aliases: [] });
    expect(matchScore(wf, "whole foods")).toBeGreaterThan(20);
  });

  it("picks the strongest candidate out of a list", () => {
    const list = [
      merchant({ slug: "costco", name: "Costco", aliases: [] }),
      merchant({ slug: "costco-gas", name: "Costco Gas Station", aliases: [] }),
    ];
    expect(bestMatch(list, "costco gas station")?.merchant.slug).toBe("costco-gas");
    expect(bestMatch(list, "costco")?.merchant.slug).toBe("costco");
  });
});

describe("MCC helpers", () => {
  it("parses codes out of whatever separators someone types", () => {
    expect(parseMccList("5812, 5813 5814")).toEqual([5812, 5813, 5814]);
    expect(parseMccList("5812,5812")).toEqual([5812]);
    expect(parseMccList("nonsense")).toEqual([]);
    expect(parseMccList("12, 99999")).toEqual([]);
  });

  it("splits concatenated codes instead of treating them as one giant integer", () => {
    expect(expandMccCodes([581258135814])).toEqual([5812, 5813, 5814]);
    expect(expandMccCodes([5411554158124899])).toEqual([5411, 5541, 5812, 4899]);
    expect(expandMccCodes([5812, 5814])).toEqual([5812, 5814]);
    expect(expandMccCodes(["5812", "5813"])).toEqual([5812, 5813]);
    expect(expandMccCodes(["5812, 5813"])).toEqual([5812, 5813]);
    expect(expandMccCodes(["5411554158124899"])).toEqual([5411, 5541, 5812, 4899]);
    expect(expandMccCodes([Number.MAX_SAFE_INTEGER + 1])).toEqual([]);
  });

  it("recovers codes for a category the model left empty", () => {
    expect(inferMccCodes("U.S. gas stations")).toEqual([5541, 5542]);
    expect(inferMccCodes("US supermarkets")).toEqual([5411]);
    expect(inferMccCodes("Select streaming services")).toContain(4899);
    expect(inferMccCodes("Restaurants worldwide")).toEqual([5812, 5813, 5814]);
  });

  it("prefers the more specific category when a label could match twice", () => {
    // "EV charging" must not fall through to the gas group.
    expect(inferMccCodes("EV charging")).toEqual([5552]);
    // "car rental" must not be swallowed by the broad travel group.
    expect(inferMccCodes("Car rental")).toEqual([3351, 7512]);
  });

  it("returns nothing for a label it cannot place", () => {
    expect(inferMccCodes("Purchases made on a Tuesday")).toEqual([]);
  });
});
