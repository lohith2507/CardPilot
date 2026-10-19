import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Narrows a caller-supplied redirect target to a path on this site, falling back
 * to the home page.
 *
 * A leading slash is not enough on its own: browsers read `//host` and `/\host`
 * as absolute URLs, so either would send someone to another origin after they
 * sign in.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/**
 * Formats integer cents as US dollars. Whole-dollar amounts drop the cents
 * (`1500` -> "$15"); anything else shows two decimals (`1550` -> "$15.50").
 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats a value already in percent units (not a 0-1 fraction), rounded to two
 * decimals: whole numbers print bare (`3` -> "3%"), others keep two places
 * (`2.5` -> "2.50%").
 */
export function formatPct(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}%`;
}

/**
 * Formats an earn-rate multiplier rounded to two decimals, without trailing
 * zeros (`3` -> "3", `1.5` -> "1.5", `1.333` -> "1.33").
 */
export function formatRate(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : String(rounded);
}
