import { describe, expect, it } from "vitest";
import { searchCards, type CatalogPick } from "@/lib/card-directory";

const catalog: CatalogPick[] = [
  {
    cardId: 1,
    slug: "chase-sapphire-preferred",
    issuer: "Chase",
    product: "Sapphire Preferred",
    network: "visa",
    colorFrom: "#1e3a5f",
    colorTo: "#0b1c30",
    artUrl: null,
    inWallet: false,
    annualFeeCents: 9500,
    baseRate: 1,
    isCashback: false,
  },
  {
    cardId: 2,
    slug: "amex-gold",
    issuer: "American Express",
    product: "Gold Card",
    network: "amex",
    colorFrom: "#b58e3f",
    colorTo: "#6b4f18",
    artUrl: null,
    inWallet: true,
    annualFeeCents: 32500,
    baseRate: 1,
    isCashback: false,
  },
];

describe("searchCards", () => {
  it("lists every Chase product when you type the issuer", () => {
    const hits = searchCards("chase", catalog);
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(hits.every((h) => /chase|amazon/i.test(h.issuer + h.lookupName))).toBe(true);
    const preferred = hits.find((h) => h.slug === "chase-sapphire-preferred");
    expect(preferred?.cardId).toBe(1);
    expect(preferred?.readyToAdd).toBe(true);
  });

  it("marks wallet membership from the catalogue", () => {
    const hits = searchCards("amex", catalog);
    const gold = hits.find((h) => h.slug === "amex-gold");
    expect(gold?.inWallet).toBe(true);
    expect(gold?.readyToAdd).toBe(false);
  });

  it("returns nothing for an empty query", () => {
    expect(searchCards("", catalog)).toEqual([]);
  });
});
