import { ExternalLink, Sparkles, WifiOff } from "lucide-react";
import { Pill } from "@/components/ui";
import { sourceLabel } from "@/lib/merchant-lookup";
import type { RecommendResult } from "@/lib/recommend";
import { cn } from "@/lib/utils";

function HighlightedSummary({ summary, highlight }: { summary: string; highlight: string }) {
  if (!highlight.trim()) {
    return <p className="text-[15px] leading-[1.65] text-ink/90">{summary}</p>;
  }

  const idx = summary.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) {
    return <p className="text-[15px] leading-[1.65] text-ink/90">{summary}</p>;
  }

  const before = summary.slice(0, idx);
  const match = summary.slice(idx, idx + highlight.length);
  const after = summary.slice(idx + highlight.length);

  return (
    <p className="text-[15px] leading-[1.65] text-ink/90">
      {before}
      <mark className="rounded-sm bg-brand-soft px-1 py-0.5 text-ink not-italic">{match}</mark>
      {after}
    </p>
  );
}

export function MerchantOverview({
  result,
  query,
  className,
}: {
  result: RecommendResult;
  query?: string;
  className?: string;
}) {
  const { merchant, resolvedBy } = result;
  const sources = merchant.sources ?? [];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-lifted",
        className,
      )}
    >
      <div className="border-b border-line/50 bg-gradient-to-br from-raised/80 to-surface px-5 py-4">
        {query ? (
          <p className="mb-3 text-right">
            <span className="inline-flex rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-muted">
              {query}
            </span>
          </p>
        ) : null}

        <h2 className="text-xl font-bold tracking-tight text-ink underline decoration-brand/30 decoration-2 underline-offset-4">
          {merchant.name}
        </h2>

        <div className="mt-3">
          <HighlightedSummary summary={merchant.summary} highlight={merchant.highlight} />
        </div>

        {sources.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
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
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        <Pill>
          {merchant.mcc} · {merchant.mccLabel}
        </Pill>
        <Pill tone="neutral">{merchant.category}</Pill>
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
      </div>

      {merchant.codingNote ? (
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
        <div className="flex gap-2 pt-1">
          <div className="h-7 w-24 animate-pulse rounded-full bg-line/60" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-line/60" />
        </div>
      </div>
      <div className="flex gap-2 px-5 py-3.5">
        <div className="h-7 w-28 animate-pulse rounded-full bg-line/60" />
        <div className="h-7 w-20 animate-pulse rounded-full bg-line/60" />
      </div>
    </div>
  );
}
