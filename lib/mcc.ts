/**
 * Merchant category codes. Rewards are paid on the MCC a merchant transmits,
 * not on what the store looks like from the sidewalk, so these groupings are
 * what bonus categories actually match against.
 */

export const MCC = {
  RESTAURANTS: [5812, 5813, 5814],
  FAST_FOOD: [5814],
  BARS: [5813],
  GROCERY: [5411],
  WHOLESALE_CLUBS: [5300],
  DISCOUNT_STORES: [5310, 5311, 5399],
  GAS: [5541, 5542],
  EV_CHARGING: [5552],
  DRUGSTORES: [5912],
  STREAMING: [4899, 5815, 5816, 7841],
  TRANSIT: [4111, 4112, 4121, 4131, 4784, 7523],
  RIDESHARE: [4121],
  AIRLINES: [3000, 3001, 3058, 3066, 4511],
  HOTELS: [3501, 7011],
  CAR_RENTAL: [3351, 7512],
  TRAVEL_AGENCY: [4722],
  CRUISE: [4411],
  ENTERTAINMENT: [7832, 7922, 7929, 7996, 7998, 7999],
  HOME_IMPROVEMENT: [5200, 5211],
  FITNESS: [7997, 7298],
  ELECTRONICS: [5732],
  GENERAL_MERCHANDISE: [5942, 5999],
  CONVENIENCE: [5499],
};

/** Everything most issuers count as "travel" under a broad travel bonus. */
export const MCC_TRAVEL_BROAD: number[] = [
  ...MCC.AIRLINES,
  ...MCC.HOTELS,
  ...MCC.CAR_RENTAL,
  ...MCC.TRAVEL_AGENCY,
  ...MCC.CRUISE,
  ...MCC.TRANSIT,
];

export const MCC_LABELS: Record<number, string> = {
  3000: "Airline",
  3001: "Airline",
  3058: "Airline",
  3066: "Airline",
  3351: "Car rental",
  3501: "Hotel",
  4111: "Commuter transport",
  4112: "Passenger railway",
  4121: "Taxi and rideshare",
  4131: "Bus line",
  4411: "Cruise line",
  4511: "Airline",
  4722: "Travel agency",
  4784: "Tolls and bridge fees",
  4899: "Cable and streaming",
  5200: "Home supply warehouse",
  5211: "Building materials",
  5300: "Wholesale club",
  5310: "Discount store",
  5311: "Department store",
  5399: "General merchandise",
  5411: "Grocery store",
  5499: "Convenience store",
  5541: "Service station",
  5542: "Automated fuel dispenser",
  5552: "EV charging",
  5732: "Electronics store",
  5812: "Restaurant",
  5813: "Bar",
  5814: "Fast food",
  5815: "Digital media",
  5816: "Digital games",
  5912: "Drugstore and pharmacy",
  5942: "Book store",
  5999: "Specialty retail",
  7011: "Lodging",
  7298: "Spa and wellness",
  7512: "Car rental",
  7523: "Parking",
  7832: "Movie theater",
  7841: "Video rental",
  7922: "Ticket agency",
  7929: "Live entertainment",
  7996: "Amusement park",
  7997: "Membership club",
  7998: "Aquarium and zoo",
  7999: "Recreation service",
};

export function mccLabel(mcc: number): string {
  return MCC_LABELS[mcc] ?? `MCC ${mcc}`;
}

export function parseMccList(input: string): number[] {
  return [
    ...new Set(
      input
        .split(/[^0-9]+/)
        .map((part) => Number.parseInt(part, 10))
        .filter((n) => Number.isInteger(n) && n >= 700 && n <= 9999),
    ),
  ];
}

/**
 * Models sometimes emit several 4-digit codes glued into one value. Recover
 * them when we can; drop anything we cannot rather than failing extraction.
 */
export function expandMccCodes(values: unknown): number[] {
  if (!Array.isArray(values)) {
    if (typeof values === "string" || typeof values === "number") {
      return expandMccCodes([values]);
    }
    return [];
  }

  const out: number[] = [];
  const push = (n: number) => {
    if (Number.isInteger(n) && n >= 700 && n <= 9999) out.push(n);
  };
  const pushDigitRun = (digits: string) => {
    if (/^\d+$/.test(digits) && digits.length > 4) {
      for (let i = 0; i + 4 <= digits.length; i += 4) {
        push(Number.parseInt(digits.slice(i, i + 4), 10));
      }
      return;
    }
    out.push(...parseMccList(digits));
  };

  for (const item of values) {
    if (typeof item === "string") {
      pushDigitRun(item.trim());
      continue;
    }
    if (typeof item !== "number" || !Number.isFinite(item)) continue;
    if (!Number.isSafeInteger(item)) {
      // Precision already lost; nothing recoverable.
      continue;
    }
    if (item >= 700 && item <= 9999) {
      push(item);
      continue;
    }
    if (item > 9999) pushDigitRun(String(item));
  }

  return [...new Set(out)];
}

/**
 * Ordered most specific first. A rule with no MCC codes can never pay out, so
 * when an extraction leaves them empty this recovers them from the category
 * name rather than saving a rule that silently does nothing.
 */
const LABEL_TO_MCC: [RegExp, number[]][] = [
  [/\b(fast[\s-]?food|quick[\s-]?service)\b/i, MCC.FAST_FOOD],
  [/\b(restaurants?|dining|diners?|eater(?:y|ies)|takeout|food deliver)/i, MCC.RESTAURANTS],
  [/\b(bars?|pubs?|taverns?|nightclubs?)\b/i, MCC.BARS],
  [/\b(supermarket|grocer)/i, MCC.GROCERY],
  [/\b(wholesale|warehouse club)/i, MCC.WHOLESALE_CLUBS],
  [/\b(superstore|discount store|department store)/i, MCC.DISCOUNT_STORES],
  [/\b(ev charg|electric vehicle charg)/i, MCC.EV_CHARGING],
  [/\b(gas station|gasoline|fuel|petrol|service station)/i, MCC.GAS],
  [/\b(drugstore|drug store|pharmac)/i, MCC.DRUGSTORES],
  [/\bstream/i, MCC.STREAMING],
  [/\b(rideshare|ride share|taxis?|limo)\b/i, MCC.RIDESHARE],
  [/\b(transit|commut|railway|subway|bus line|parking|tolls?)\b/i, MCC.TRANSIT],
  [/\b(car rental|rental car|auto rental)/i, MCC.CAR_RENTAL],
  [/\b(flights?|airfare|airlines?|air travel)\b/i, MCC.AIRLINES],
  [/\b(hotels?|lodging|motels?|resorts?)\b/i, MCC.HOTELS],
  [/\bcruises?\b/i, MCC.CRUISE],
  [/\b(home improvement|hardware store|building material)/i, MCC.HOME_IMPROVEMENT],
  [/\b(gyms?|fitness|health club)/i, MCC.FITNESS],
  [/\b(entertainment|movies?|cinemas?|theatres?|theaters?|concerts?|live event|ticket)/i, MCC.ENTERTAINMENT],
  [/\belectronic/i, MCC.ELECTRONICS],
  [/\bconvenience store/i, MCC.CONVENIENCE],
  [/\b(online retail|general merchandise|online shopping|online purchase)/i, MCC.GENERAL_MERCHANDISE],
  [/\btravel\b/i, MCC_TRAVEL_BROAD],
];

export function inferMccCodes(label: string): number[] {
  for (const [pattern, codes] of LABEL_TO_MCC) {
    if (pattern.test(label)) return [...codes];
  }
  return [];
}

/** Shared with the models so merchant lookup and card extraction agree. */
export const MCC_REFERENCE = `Common merchant category codes:
- 5812 sit-down restaurants, 5814 fast food, 5813 bars
- 5411 grocery stores and supermarkets
- 5300 warehouse clubs, 5310 discount stores, 5311 department stores, 5399 general merchandise
- 5541 service stations, 5542 automated fuel dispensers, 5552 EV charging
- 5912 drugstores and pharmacies
- 4899 cable and streaming, 5815 digital media, 5816 digital games
- 4111 commuter transport, 4112 rail, 4121 taxi and rideshare, 4131 bus, 4784 tolls, 7523 parking
- 4511 airlines, 7011 lodging, 7512 car rental, 4722 travel agencies, 4411 cruise lines
- 7832 cinemas, 7922 ticket agencies, 7929 live entertainment, 7996 amusement parks, 7999 recreation
- 5200 home supply warehouses, 5211 building materials
- 7997 gyms and membership clubs, 7298 spas
- 5732 electronics, 5942 book stores, 5999 specialty retail, 5499 convenience stores`;
