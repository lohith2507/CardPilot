"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Globe, Info, Loader2, Search, Sparkles, WifiOff } from "lucide-react";
import { CardFace, CardSliver, CardSwatch } from "@/components/card-face";
import { Receipt, ReceiptNote, ReceiptRow } from "@/components/receipt";
import { Button, Eyebrow, Input, Panel, Pill } from "@/components/ui";
import type { CardScore } from "@/lib/engine/types";
import { readSnapshot, recommendOffline, refreshSnapshot } from "@/lib/offline";
import type { RecommendResult } from "@/lib/recommend";
import { cn, formatCents, formatPct } from "@/lib/utils";

export type MerchantChip = {
  id: number;
  slug: string;
  name: string;
  mcc: number;
  mccLabel: string;
  category: string;
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const amountCents = Math.max(1, Math.round((Number.parseFloat(amount) || 0) * 100));

  const suggestionsOpen = showSuggestions && query.trim().length >= 2;
  const visibleSuggestions = suggestionsOpen ? suggestions : [];

  useEffect(() => {
    if (!suggestionsOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/merchants/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { merchants: Suggestion[] };
        setSuggestions(data.merchants);
      } catch {
        // Aborted by the next keystroke.
      }
    }, 170);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, suggestionsOpen]);

  // Kept current so a dead network still has something to rank against.
  useEffect(() => {
    void refreshSnapshot();
  }, []);

  const run = useCallback(
    async (searchTerm: string, cents: number, foreign: boolean) => {
      const term = searchTerm.trim();
      if (!term) return;

      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      setShowSuggestions(false);
      inputRef.current?.blur();

      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term, amountCents: cents, isForeign: foreign }),
        });
        const data = await res.json();
        if (id !== requestId.current) return;

        if (!res.ok) {
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

  // Keep the ranking honest when the amount or location changes after a search.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      void run(result.merchant.name, amountCents, isForeign);
    }, 350);
    return () => clearTimeout(timer);
    // Re-running on result would loop; the merchant name is read from the latest result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountCents, isForeign]);

  const onLogged = useCallback(() => {
    if (result) void run(result.merchant.name, amountCents, isForeign);
    router.refresh();
  }, [result, amountCents, isForeign, run, router]);

  const chips = recents.length > 0 ? recents : [];

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>CardPilot</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Compare at a purchase</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Ranks only the cards in your wallet, using the earn rules you saved. Estimates — not
          advice. Confirm rates with your issuer when it matters.
        </p>
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
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
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
            placeholder="McDonald's, Costco gas, Delta…"
            aria-label="Merchant or place"
            autoComplete="off"
            enterKeyHint="search"
            className="py-4 pl-11 pr-11 text-base"
          />
          {loading ? (
            <Loader2
              size={18}
              className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-brand"
              aria-label="Comparing cards"
            />
          ) : null}

          {visibleSuggestions.length > 0 ? (
            <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lifted">
              {visibleSuggestions.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(m.name);
                      void run(m.name, amountCents, isForeign);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
                  >
                    <span className="text-sm font-medium text-ink">{m.name}</span>
                    <span className="numeral text-[11px] text-muted">
                      {m.mcc} · {m.mccLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Purchase amount</span>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">
              $
            </span>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="25"
              className="numeral py-3 pl-8 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => setIsForeign((v) => !v)}
            aria-pressed={isForeign}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold transition-colors",
              isForeign
                ? "border-brand/30 bg-brand-soft text-brand-deep"
                : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            <Globe size={15} aria-hidden />
            Abroad
          </button>
        </div>
      </form>

      {!result && !error && chips.length > 0 ? (
        <section>
          <Eyebrow>{recents.length > 0 ? "Recent" : "Try one"}</Eyebrow>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {chips.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setQuery(m.name);
                  void run(m.name, amountCents, isForeign);
                }}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-card transition-colors hover:border-brand/40 hover:text-brand"
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {walletCount === 0 ? (
        <Panel className="space-y-3 border-brand/20 bg-brand-soft">
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

      {error ? (
        <Panel className="border-rose/20 bg-rose-soft">
          <p className="text-sm text-ink">{error}</p>
        </Panel>
      ) : null}

      {result ? <Result result={result} onLogged={onLogged} /> : null}
    </div>
  );
}

function Result({ result, onLogged }: { result: RecommendResult; onLogged: () => void }) {
  const eligible = result.scores.filter((s) => s.eligible);
  const winner = eligible[0];
  const runnersUp = result.scores.slice(1);

  if (!winner) {
    return (
      <Panel className="border-rose/20 bg-rose-soft">
        <p className="text-sm text-ink">
          None of the cards in your wallet look usable at {result.merchant.name}
          {result.merchant.networkExclusions.length > 0
            ? ` — it typically refuses ${result.merchant.networkExclusions.join(", ")}`
            : ""}
          .
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <MerchantStrip result={result} />

      <section className="relative pt-6">
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
          issuer={winner.card.issuer}
          product={winner.card.product}
          network={winner.card.network}
          colorFrom={winner.card.colorFrom}
          colorTo={winner.card.colorTo}
          headline={formatPct(winner.effectiveRatePct)}
          headlineLabel={`About ${formatCents(Math.round(winner.totalValueCents))} on ${formatCents(result.amountCents)}`}
          className="relative z-10 animate-card-lift"
        />
      </section>

      <MathPanel score={winner} amountCents={result.amountCents} />

      {/* Remounts per merchant and amount so the confirmed state never lingers. */}
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

function MerchantStrip({ result }: { result: RecommendResult }) {
  const { merchant, resolvedBy } = result;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{merchant.name}</h2>
        <Pill>
          {merchant.mcc} · {merchant.mccLabel}
        </Pill>
        {resolvedBy === "ai" ? (
          <Pill tone="brand">
            <Sparkles size={11} aria-hidden />
            Category estimated
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
        <div className="flex gap-2.5 rounded-xl border border-line bg-surface p-3.5 shadow-card">
          <Info size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">{merchant.codingNote}</p>
        </div>
      ) : null}

      {resolvedBy === "ai" && !merchant.codingNote ? (
        <div className="flex gap-2.5 rounded-xl border border-line bg-surface p-3.5 shadow-card">
          <Info size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Merchant category was estimated from the name. If the MCC looks wrong, the ranking will
            be wrong — check how the purchase usually codes.
          </p>
        </div>
      ) : null}
    </section>
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
      <CardSwatch colorFrom={score.card.colorFrom} colorTo={score.card.colorTo} />
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
