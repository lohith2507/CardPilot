"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Globe, Loader2, Search } from "lucide-react";
import { CardFace, CardSliver, CardSwatch } from "@/components/card-face";
import { MerchantOverview, MerchantOverviewSkeleton } from "@/components/merchant-overview";
import { Receipt, ReceiptNote, ReceiptRow } from "@/components/receipt";
import { Button, Eyebrow, Input, Panel, Pill } from "@/components/ui";
import type { CardScore } from "@/lib/engine/types";
import { CONFIDENT_MATCH, isPlausibleAlias, matchScore } from "@/lib/merchant-match";
import { readSnapshot, recommendOffline, refreshSnapshot, rerankLocal } from "@/lib/offline";
import type { RecommendResult } from "@/lib/recommend";
import { cn, formatCents, formatPct } from "@/lib/utils";

export type MerchantChip = {
  id: number;
  slug: string;
  name: string;
  mcc: number;
  mccLabel: string;
  category: string;
  lookedUp?: boolean;
};

type Suggestion = MerchantChip;

export function Recommender({
  recents,
  walletCount,
}: {
  recents: MerchantChip[];
  walletCount: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("25");
  const [isForeign, setIsForeign] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const amountCents = Math.max(1, Math.round((Number.parseFloat(amount) || 0) * 100));

  const suggestionsOpen = showSuggestions && query.trim().length >= 2;
  const visibleSuggestions = suggestionsOpen ? suggestions : [];
  const topSuggestion = visibleSuggestions[0];
  const localIsSure =
    Boolean(topSuggestion) &&
    matchScore(
      { name: topSuggestion.name, slug: topSuggestion.slug, aliases: [] },
      query,
    ) >= CONFIDENT_MATCH &&
    isPlausibleAlias(query, topSuggestion.name);
  const showLookupRow =
    suggestionsOpen && !suggestLoading && query.trim().length >= 2 && !localIsSure;

  useEffect(() => {
    if (!suggestionsOpen) {
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/merchants/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { merchants: Suggestion[] };
        if (!controller.signal.aborted) setSuggestions(data.merchants);
      } catch {
        // Aborted by the next keystroke.
      } finally {
        if (!controller.signal.aborted) setSuggestLoading(false);
      }
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setSuggestLoading(false);
    };
  }, [query, suggestionsOpen]);

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  const run = useCallback(
    async (searchTerm: string, cents: number, foreign: boolean) => {
      const term = searchTerm.trim();
      if (!term) return;

      const id = ++requestId.current;
      setLastQuery(term);
      setError(null);
      setShowSuggestions(false);
      inputRef.current?.blur();

      const snap = readSnapshot();
      const snapshotHit = snap ? recommendOffline(snap, term, cents, foreign) : null;
      if (snapshotHit) {
        setResult(snapshotHit);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term, amountCents: cents, isForeign: foreign }),
        });
        const data = await res.json();
        if (id !== requestId.current) return;

        if (!res.ok) {
          if (snapshotHit) return;
          setError(data.error ?? "Could not compare your cards for that place.");
          setResult(null);
          return;
        }
        setResult(data as RecommendResult);
      } catch {
        if (id !== requestId.current) return;

        const snapshot = readSnapshot();
        const offline = snapshot ? recommendOffline(snapshot, term, cents, foreign) : null;
        if (offline) {
          setResult(offline);
        } else {
          setResult(null);
          setError(
            snapshot
              ? `You're offline and ${term} isn't in the cards saved on this device.`
              : "You're offline and nothing has been saved on this device yet.",
          );
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  // Amount and abroad toggle re-rank instantly in the browser — no second web lookup.
  useEffect(() => {
    setResult((prev) => {
      if (!prev) return prev;
      return rerankLocal(prev, amountCents, isForeign) ?? prev;
    });
  }, [amountCents, isForeign]);

  const onLogged = useCallback(() => {
    if (result) void run(result.merchant.name, amountCents, isForeign);
    router.refresh();
  }, [result, amountCents, isForeign, run, router]);

  const chips = recents.length > 0 ? recents : [];
  const hasResult = Boolean(result) || loading;

  return (
    <div className="space-y-7">
      <header className={cn(hasResult ? "space-y-1" : "space-y-3 pb-2 text-center")}>
        <Eyebrow className={hasResult ? undefined : "justify-center"}>CardPilot</Eyebrow>
        <h1
          className={cn(
            "font-bold tracking-tight text-ink",
            hasResult ? "text-2xl" : "text-[1.75rem] leading-tight sm:text-3xl",
          )}
        >
          {hasResult ? "Compare at a purchase" : "Which card here?"}
        </h1>
        {!hasResult ? (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
            Search any place — we look it up, explain what it is, then rank cards in your wallet
            by the rules you saved.
          </p>
        ) : null}
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query, amountCents, isForeign);
        }}
        className="space-y-3"
      >
        <div className="relative">
          <Search
            size={20}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Desi Adda, Mayuri, Costco gas…"
            aria-label="Merchant or place"
            autoComplete="off"
            enterKeyHint="search"
            className={cn(
              "border-line/80 py-4 pl-12 pr-12 text-base shadow-card transition-shadow focus:shadow-lifted",
              hasResult ? "rounded-xl" : "rounded-2xl",
              loading && "animate-search-pulse border-brand/40 ring-2 ring-brand/20",
            )}
          />
          {loading ? (
            <Loader2
              size={20}
              className="absolute right-5 top-1/2 -translate-y-1/2 animate-spin text-brand"
              aria-label="Looking up merchant"
            />
          ) : null}

          {visibleSuggestions.length > 0 || suggestLoading || showLookupRow ? (
            <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lifted">
              {suggestLoading ? (
                <li className="flex items-center gap-2.5 px-4 py-3.5 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin text-brand" aria-hidden />
                  Searching saved places…
                </li>
              ) : null}
              {visibleSuggestions.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(m.name);
                      void run(m.name, amountCents, isForeign);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-raised"
                  >
                    <span className="text-sm font-medium text-ink">{m.name}</span>
                    <span className="numeral text-[11px] text-muted">
                      {m.lookedUp ? "Looked up · " : ""}
                      {m.mcc} · {m.mccLabel}
                    </span>
                  </button>
                </li>
              ))}
              {showLookupRow ? (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void run(query, amountCents, isForeign)}
                    className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left transition-colors hover:bg-raised"
                  >
                    <Globe size={16} className="shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        Look up “{query.trim()}”
                      </span>
                      <span className="block text-[11px] text-muted">
                        Search the web for this store or restaurant
                      </span>
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Purchase amount</span>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">
              $
            </span>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="25"
              className="numeral rounded-xl py-3 pl-8 text-sm shadow-card"
            />
          </label>

          <button
            type="button"
            onClick={() => setIsForeign((v) => !v)}
            aria-pressed={isForeign}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-card transition-colors",
              isForeign
                ? "border-brand/30 bg-brand-soft text-brand-deep"
                : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            <Globe size={15} aria-hidden />
            Abroad
          </button>

          <Button
            type="submit"
            size="sm"
            disabled={!query.trim() || loading}
            className="shrink-0 rounded-xl px-4 py-3"
          >
            {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} aria-hidden />}
            Search
          </Button>
        </div>
      </form>

      {loading && lastQuery ? <SearchProgress query={lastQuery} /> : null}

      {!loading && !result && !error && chips.length > 0 ? (
        <section>
          <Eyebrow>{recents.length > 0 ? "Recent" : "Try one"}</Eyebrow>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            {chips.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setQuery(m.name);
                  void run(m.name, amountCents, isForeign);
                }}
                className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand hover:shadow-lifted"
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {walletCount === 0 && !hasResult ? (
        <Panel className="space-y-3 border-brand/20 bg-brand-soft/70">
          <p className="text-sm leading-relaxed text-ink">
            Your wallet is empty, so there is nothing to compare. Add the cards you carry — then
            rankings use only those rules.
          </p>
          <Link
            href="/cards/add"
            className="inline-flex rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            Add a card
          </Link>
        </Panel>
      ) : null}

      {loading ? (
        <div className="space-y-6">
          <MerchantOverviewSkeleton query={lastQuery} />
          <div className="space-y-3 pt-2">
            <div className="h-4 w-40 animate-pulse rounded bg-line/60" />
            <div className="h-44 animate-pulse rounded-2xl bg-line/50" />
          </div>
        </div>
      ) : null}

      {error && !loading ? (
        <Panel className="border-rose/20 bg-rose-soft">
          <p className="text-sm text-ink">{error}</p>
        </Panel>
      ) : null}

      {result && !loading ? (
        <Result result={result} query={lastQuery} onLogged={onLogged} walletCount={walletCount} />
      ) : null}
    </div>
  );
}

function SearchProgress({ query }: { query: string }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-brand/25 bg-brand-soft/50 animate-slide-up"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <Loader2 size={20} className="shrink-0 animate-spin text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">Looking up {query}</p>
          <p className="text-xs text-muted">Searching the web, then ranking cards in your wallet…</p>
        </div>
      </div>
      <div className="h-1 overflow-hidden bg-brand/10">
        <div className="h-full w-2/5 rounded-full bg-brand animate-progress-slide" />
      </div>
    </div>
  );
}

function Result({
  result,
  query,
  onLogged,
  walletCount,
}: {
  result: RecommendResult;
  query: string;
  onLogged: () => void;
  walletCount: number;
}) {
  const eligible = result.scores.filter((s) => s.eligible);
  const winner = eligible[0];
  const runnersUp = result.scores.slice(1);

  if (walletCount === 0) {
    return (
      <div className="space-y-6 animate-slide-up">
        <MerchantOverview result={result} query={query} />
        <Panel className="space-y-3 border-brand/20 bg-brand-soft/70">
          <p className="text-sm leading-relaxed text-ink">
            We found this place, but your wallet is empty — add cards to see which one earns the
            most here.
          </p>
          <Link
            href="/cards/add"
            className="inline-flex rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            Add a card
          </Link>
        </Panel>
      </div>
    );
  }

  if (!winner) {
    return (
      <div className="space-y-6 animate-slide-up">
        <MerchantOverview result={result} query={query} />
        <Panel className="border-rose/20 bg-rose-soft">
          <p className="text-sm text-ink">
            None of the cards in your wallet look usable at {result.merchant.name}
            {result.merchant.networkExclusions.length > 0
              ? ` — it typically refuses ${result.merchant.networkExclusions.join(", ")}`
              : ""}
            .
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-7 animate-slide-up">
      <MerchantOverview result={result} query={query} />

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <Eyebrow className="shrink-0">Card for this purchase</Eyebrow>
          <div className="h-px flex-1 bg-line" />
        </div>

        <div className="relative pt-2">
          <Eyebrow className="mb-3">Highest estimate in your wallet</Eyebrow>
          {runnersUp.slice(0, 2).map((s, i) => (
            <CardSliver
              key={s.userCardId}
              colorFrom={s.card.colorFrom}
              colorTo={s.card.colorTo}
              style={{
                transform: `rotate(${i === 0 ? -4.5 : 4}deg) translateY(${-10 - i * 9}px) scale(${0.965 - i * 0.045})`,
                zIndex: -i - 1,
              }}
            />
          ))}
          <CardFace
            slug={winner.card.slug}
            issuer={winner.card.issuer}
            product={winner.card.product}
            network={winner.card.network}
            colorFrom={winner.card.colorFrom}
            colorTo={winner.card.colorTo}
            headline={formatPct(winner.effectiveRatePct)}
            headlineLabel={`About ${formatCents(Math.round(winner.totalValueCents))} on ${formatCents(result.amountCents)}`}
            className="relative z-10 animate-card-lift"
          />
        </div>
      </section>

      <MathPanel score={winner} amountCents={result.amountCents} />

      <LogButton
        key={`${result.merchant.id}-${result.amountCents}`}
        result={result}
        winner={winner}
        onLogged={onLogged}
      />

      {runnersUp.length > 0 ? (
        <section>
          <Eyebrow>Other cards you carry</Eyebrow>
          <ul className="mt-3 space-y-2">
            {runnersUp.map((s, i) => (
              <RunnerUp key={s.userCardId} score={s} rank={i + 2} winner={winner} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-[11px] leading-relaxed text-muted">
        Not financial advice. Figures follow the rules and point values saved in Settings.
      </p>
    </div>
  );
}

function MathPanel({ score, amountCents }: { score: CardScore; amountCents: number }) {
  return (
    <Panel>
      <Eyebrow>How this was calculated</Eyebrow>
      <Receipt className="mt-3.5">
        {score.reasons.map((reason, i) => (
          <ReceiptRow
            key={i}
            label={reason.label}
            value={reason.value}
            note={reason.note}
            tone={reason.tone ?? "default"}
          />
        ))}
        <ReceiptRow
          label={`Estimated value on ${formatCents(amountCents)}`}
          value={`${formatCents(Math.round(score.totalValueCents))} · ${formatPct(score.effectiveRatePct)}`}
          tone="total"
        />
      </Receipt>

      {score.warnings.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-line pt-4">
          {score.warnings.map((w, i) => (
            <li key={i} className="flex gap-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden />
              <span className="text-xs leading-relaxed text-muted">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {score.appliedRule?.notes ? <ReceiptNote>{score.appliedRule.notes}</ReceiptNote> : null}
    </Panel>
  );
}

function RunnerUp({ score, rank, winner }: { score: CardScore; rank: number; winner: CardScore }) {
  const delta = score.totalValueCents - winner.totalValueCents;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface px-3.5 py-3 shadow-card">
      <span className="numeral w-4 shrink-0 text-xs text-muted">{rank}</span>
      <CardSwatch slug={score.card.slug} colorFrom={score.card.colorFrom} colorTo={score.card.colorTo} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            score.eligible ? "text-ink" : "text-muted line-through",
          )}
        >
          {score.card.product}
        </p>
        <p className="truncate text-xs text-muted">
          {score.eligible
            ? (score.appliedRule?.label ?? "Base rate")
            : (score.ineligibleReason ?? "Not accepted")}
        </p>
      </div>
      {score.eligible ? (
        <div className="shrink-0 text-right">
          <p className="numeral text-sm font-semibold text-ink">
            {formatPct(score.effectiveRatePct)}
          </p>
          <p className="numeral text-[11px] text-muted">
            {delta === 0 ? "tied" : formatCents(Math.round(delta))}
          </p>
        </div>
      ) : (
        <Pill tone="rose">No</Pill>
      )}
    </li>
  );
}

function LogButton({
  result,
  winner,
  onLogged,
}: {
  result: RecommendResult;
  winner: CardScore;
  onLogged: () => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  if (result.offline) {
    return (
      <Button size="lg" variant="outline" disabled>
        Reconnect to log this purchase
      </Button>
    );
  }

  async function log() {
    setState("saving");
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userCardId: winner.userCardId,
        merchantId: result.merchant.id,
        merchantName: result.merchant.name,
        mcc: result.merchant.mcc,
        amountCents: result.amountCents,
        earnRuleId: winner.appliedRule?.id ?? null,
      }),
    });
    if (!res.ok) {
      setState("idle");
      return;
    }
    setState("saved");
    onLogged();
  }

  return (
    <Button
      size="lg"
      onClick={log}
      disabled={state !== "idle"}
      variant={state === "saved" ? "outline" : "primary"}
    >
      {state === "saving" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
      {state === "saved" ? <Check size={16} aria-hidden /> : null}
      {state === "saved"
        ? `Logged to ${winner.card.product}`
        : `Log ${formatCents(result.amountCents)} to ${winner.card.product}`}
    </Button>
  );
}
