"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Heart, Loader2, Pencil, Sparkles, WifiOff } from "lucide-react";
import { correctMerchant, toggleFavorite } from "@/app/actions";
import { Button, Input, Pill } from "@/components/ui";
import { sourceLabel } from "@/lib/merchant-lookup";
import type { RecommendResult } from "@/lib/recommend";
import { cn } from "@/lib/utils";

const MCC_PRESETS: { mcc: number; category: string }[] = [
  { mcc: 5812, category: "Restaurant" },
  { mcc: 5814, category: "Fast food" },
  { mcc: 5411, category: "Grocery" },
  { mcc: 5542, category: "Gas" },
  { mcc: 5912, category: "Drugstore" },
  { mcc: 5300, category: "Warehouse club" },
  { mcc: 5310, category: "Discount store" },
  { mcc: 4511, category: "Airline" },
  { mcc: 7011, category: "Hotel" },
  { mcc: 4121, category: "Rideshare" },
  { mcc: 5999, category: "Specialty retail" },
];

const NETWORKS = ["visa", "mastercard", "amex", "discover"] as const;

function HighlightedSummary({ summary, highlight }: { summary: string; highlight: string }) {
  if (!highlight.trim()) {
    return <p className="text-[15px] leading-[1.65] text-ink/90">{summary}</p>;
  }
  const idx = summary.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) {
    return <p className="text-[15px] leading-[1.65] text-ink/90">{summary}</p>;
  }
  return (
    <p className="text-[15px] leading-[1.65] text-ink/90">
      {summary.slice(0, idx)}
      <mark className="rounded-sm bg-brand-soft px-1 py-0.5 text-ink not-italic">
        {summary.slice(idx, idx + highlight.length)}
      </mark>
      {summary.slice(idx + highlight.length)}
    </p>
  );
}

export function MerchantOverview({
  result,
  query,
  className,
  onCorrected,
}: {
  result: RecommendResult;
  query?: string;
  className?: string;
  onCorrected?: () => void;
}) {
  const { merchant, resolvedBy } = result;
  const sources = merchant.sources ?? [];
  const [favorite, setFavorite] = useState(Boolean(merchant.favorite));
  const [editing, setEditing] = useState(false);
  const [mcc, setMcc] = useState(String(merchant.mcc));
  const [category, setCategory] = useState(merchant.category);
  const [exclusions, setExclusions] = useState<string[]>(merchant.networkExclusions);
  const [note, setNote] = useState(merchant.codingNote ?? "");
  const [pending, start] = useTransition();

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-lifted",
        className,
      )}
    >
      <div className="border-b border-line/50 bg-gradient-to-br from-raised/80 to-surface px-5 py-4">
        {query && query.trim().toLowerCase() !== merchant.name.toLowerCase() ? (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            You searched “{query.trim()}”
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight text-ink underline decoration-brand/30 decoration-2 underline-offset-4">
            {merchant.name}
          </h2>
          <button
            type="button"
            className={cn(
              "rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
              favorite
                ? "border-brand/40 bg-brand-soft text-brand-deep"
                : "border-line text-muted hover:text-ink",
            )}
            onClick={() =>
              start(async () => {
                const on = await toggleFavorite(merchant.id);
                setFavorite(on);
              })
            }
            aria-label={favorite ? "Unpin favorite" : "Pin favorite"}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} fill={favorite ? "currentColor" : "none"} />}
          </button>
        </div>

        <div className="mt-3">
          <HighlightedSummary summary={merchant.summary} highlight={merchant.highlight} />
        </div>

        {sources.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              From public pages
            </p>
            <ul className="flex flex-wrap gap-2">
              {sources.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-brand/30 hover:text-brand"
                  >
                    <ExternalLink size={11} aria-hidden />
                    {sourceLabel(url)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        <Pill>
          {merchant.mcc} · {merchant.mccLabel}
        </Pill>
        <Pill tone="neutral">{merchant.category}</Pill>
        {merchant.networkExclusions.length > 0 ? (
          <Pill tone="rose">Won&apos;t take {merchant.networkExclusions.join(", ")}</Pill>
        ) : null}
        {resolvedBy === "ai" ? (
          <Pill tone="brand">
            <Sparkles size={11} aria-hidden />
            Looked up on the web
          </Pill>
        ) : null}
        {result.offline ? (
          <Pill tone="rose">
            <WifiOff size={11} aria-hidden />
            Offline
          </Pill>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted hover:text-ink"
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil size={11} aria-hidden />
          Fix category
        </button>
      </div>

      {editing ? (
        <div className="space-y-3 border-t border-line/50 px-5 py-4">
          <p className="text-xs text-muted">
            Corrections stick for ranking. Use this when the lookup picked the wrong MCC.
          </p>
          <div className="flex flex-wrap gap-2">
            {MCC_PRESETS.map((p) => (
              <button
                key={p.mcc}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  Number(mcc) === p.mcc
                    ? "border-brand bg-brand-soft text-brand-deep"
                    : "border-line text-muted",
                )}
                onClick={() => {
                  setMcc(String(p.mcc));
                  setCategory(p.category);
                }}
              >
                {p.category}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-muted">
              MCC
              <Input className="mt-1" value={mcc} onChange={(e) => setMcc(e.target.value)} />
            </label>
            <label className="block text-xs text-muted">
              Category
              <Input className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Refuses
            </p>
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => {
                const on = exclusions.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] capitalize",
                      on ? "border-rose/40 bg-rose-soft text-rose" : "border-line text-muted",
                    )}
                    onClick={() =>
                      setExclusions((prev) =>
                        on ? prev.filter((x) => x !== n) : [...prev, n],
                      )
                    }
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-xs text-muted">
            Note (optional)
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await correctMerchant({
                  merchantId: merchant.id,
                  mcc: Number.parseInt(mcc, 10),
                  category,
                  networkExclusions: exclusions,
                  codingNote: note || null,
                });
                setEditing(false);
                onCorrected?.();
              })
            }
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : null}
            Save correction
          </Button>
        </div>
      ) : null}

      {merchant.codingNote && !editing ? (
        <p className="border-t border-line/50 px-5 py-3 text-xs leading-relaxed text-muted">
          {merchant.codingNote}
        </p>
      ) : null}
    </section>
  );
}

export function MerchantOverviewSkeleton({ query }: { query?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-lifted">
      <div className="space-y-3 border-b border-line/50 bg-gradient-to-br from-raised/80 to-surface px-5 py-5">
        {query ? (
          <p className="text-xl font-bold tracking-tight text-ink">{query}</p>
        ) : (
          <div className="h-6 w-2/5 animate-pulse rounded-lg bg-line/80" />
        )}
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-line/60" />
          <div className="h-4 w-full animate-pulse rounded bg-line/60" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-line/60" />
        </div>
      </div>
    </div>
  );
}
