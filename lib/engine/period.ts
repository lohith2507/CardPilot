import type { CapPeriod } from "./types";

export type PeriodBounds = { start: Date; end: Date };

/**
 * Cap windows are treated as calendar periods. Real issuers sometimes reset on
 * your cardmember year or statement cycle instead, which is why the UI lets you
 * correct cap usage by hand.
 */
export function periodBounds(period: CapPeriod, at: Date): PeriodBounds | null {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();

  switch (period) {
    case "month":
      return { start: utc(y, m, 1), end: utc(y, m + 1, 1) };
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return { start: utc(y, qStart, 1), end: utc(y, qStart + 3, 1) };
    }
    case "year":
      return { start: utc(y, 0, 1), end: utc(y + 1, 0, 1) };
    case "none":
      return null;
  }
}

export function periodLabel(period: CapPeriod): string {
  switch (period) {
    case "month":
      return "this month";
    case "quarter":
      return "this quarter";
    case "year":
      return "this year";
    case "none":
      return "";
  }
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}
