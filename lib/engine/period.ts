import type { CapPeriod } from "./types";

export type PeriodBounds = { start: Date; end: Date };

export type PeriodOptions = {
  /** 1–28. When set, "month" caps use statement windows instead of calendar months. */
  statementDay?: number | null;
  /** Card open date (ISO). Used with statementDay for the first cycle. */
  openedAt?: string | null;
};

/**
 * Cap windows default to calendar periods. When a card has a statement day,
 * monthly caps follow that billing cycle instead.
 */
export function periodBounds(
  period: CapPeriod,
  at: Date,
  options: PeriodOptions = {},
): PeriodBounds | null {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const day = clampStatementDay(options.statementDay);

  switch (period) {
    case "month":
      if (day) return statementMonthBounds(at, day);
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

export function periodLabel(period: CapPeriod, statementDay?: number | null): string {
  switch (period) {
    case "month":
      return statementDay ? "this statement cycle" : "this month";
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

export function clampStatementDay(day: number | null | undefined): number | null {
  if (day == null || !Number.isFinite(day)) return null;
  const n = Math.trunc(day);
  if (n < 1 || n > 28) return null;
  return n;
}

function statementMonthBounds(at: Date, statementDay: number): PeriodBounds {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const d = at.getUTCDate();
  if (d >= statementDay) {
    return { start: utc(y, m, statementDay), end: utc(y, m + 1, statementDay) };
  }
  return { start: utc(y, m - 1, statementDay), end: utc(y, m, statementDay) };
}

function utc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}
