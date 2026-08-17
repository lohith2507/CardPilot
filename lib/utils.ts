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

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatPct(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}%`;
}

export function formatRate(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : String(rounded);
}
