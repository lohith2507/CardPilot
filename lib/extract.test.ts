import { describe, expect, it } from "vitest";
import { parseExtractedRaw } from "@/lib/extract";

const card = {
  issuer: "Chase",
  product: "Freedom Flex",
  network: "visa" as const,
  annualFeeCents: 0,
  fxFeePct: 3,
  baseRate: 1,
  currencyCode: "USD",
  currencyName: "Cash back",
  currencyDefaultCpp: 1,
  currencyIsCashback: true,
  colorFrom: "#1e3a5f",
  colorTo: "#0b1c30",
  notes: "",
  uncertainties: [],
};

describe("parseExtractedRaw", () => {
  it("accepts glued-together MCC codes instead of rejecting the whole card", () => {
    const parsed = parseExtractedRaw({
      ...card,
      rules: [
        {
          label: "Dining",
          mccCodes: [581258135814],
          merchantSlugs: [],
          rate: 3,
          capAmountCents: 0,
          capPeriod: "none",
          requiresActivation: false,
          selectionGroup: "",
          validFrom: "",
          validTo: "",
          priority: 0,
          notes: "",
        },
      ],
    });
    expect(parsed.rules[0].mccCodes).toEqual([5812, 5813, 5814]);
  });

  it("splits the Discover-style concatenated integer from a failed Groq generation", () => {
    const parsed = parseExtractedRaw({
      ...card,
      rules: [
        {
          label: "5% rotating categories",
          mccCodes: [5411554158124899],
          merchantSlugs: [],
          rate: 5,
          capAmountCents: 150000,
          capPeriod: "quarter",
          requiresActivation: true,
          selectionGroup: "",
          validFrom: "",
          validTo: "",
          priority: 0,
          notes: "",
        },
      ],
    });
    expect(parsed.rules[0].mccCodes).toEqual([5411, 5541, 5812, 4899]);
  });

  it("accepts MCC codes as separate strings, which is what the schema now asks for", () => {
    const parsed = parseExtractedRaw({
      ...card,
      rules: [
        {
          label: "Dining",
          mccCodes: ["5812", "5814"],
          merchantSlugs: [],
          rate: 3,
          capAmountCents: 0,
          capPeriod: "none",
          requiresActivation: false,
          selectionGroup: "",
          validFrom: "",
          validTo: "",
          priority: 0,
          notes: "",
        },
      ],
    });
    expect(parsed.rules[0].mccCodes).toEqual([5812, 5814]);
  });

  it("drops integers too large to store exactly, rather than throwing", () => {
    const parsed = parseExtractedRaw({
      ...card,
      rules: [
        {
          label: "Groceries",
          mccCodes: [Number.MAX_SAFE_INTEGER + 1],
          merchantSlugs: [],
          rate: 5,
          capAmountCents: 0,
          capPeriod: "none",
          requiresActivation: false,
          selectionGroup: "",
          validFrom: "",
          validTo: "",
          priority: 0,
          notes: "",
        },
      ],
    });
    expect(parsed.rules[0].mccCodes).toEqual([]);
  });
});
