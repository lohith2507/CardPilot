"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus, ShieldAlert } from "lucide-react";
import { CardSwatch } from "@/components/card-face";
import { Button, Eyebrow, EmptyState, Panel, Pill } from "@/components/ui";
import { addCardToWallet, removeCardFromWallet } from "@/app/actions";
import { cn, formatCents, formatPct, formatRate } from "@/lib/utils";

export type RuleView = {
  id: number;
  label: string;
  rate: number;
  capAmountCents: number | null;
  capPeriod: string;
  capUsedCents: number;
  requiresActivation: boolean;
  activated: boolean;
  selectionGroup: string | null;
  selected: boolean;
  unverified: boolean;
  notes: string | null;
};

export type CardView = {
  cardId: number;
  slug: string;
  userCardId: number | null;
  inWallet: boolean;
  issuer: string;
  product: string;
  network: string;
  colorFrom: string | null;
  colorTo: string | null;
  artUrl: string | null;
  annualFeeCents: number;
  baseRate: number;
  fxFeePct: number;
  notes: string | null;
  currencyCode: string;
  currencyName: string;
  cpp: number;
  isCashback: boolean;
  rules: RuleView[];
};

export function Wallet({ cards }: { cards: CardView[] }) {
  const mine = cards.filter((c) => c.inWallet);
  const rest = cards.filter((c) => !c.inWallet);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Wallet</Eyebrow>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
            {mine.length} card{mine.length === 1 ? "" : "s"} you carry
          </h1>
          <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-muted">
            Comparisons use only these cards and the rates saved on them. Catalogue cards below are
            not ranked until you add them.
          </p>
        </div>
        <Link
          href="/cards/add"
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          Add a card
        </Link>
      </header>

      {mine.length === 0 ? (
        <EmptyState title="Nothing to compare yet">
          Add the cards you actually carry. Until then, Compare has nothing to rank.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {mine.map((card) => (
            <CardRow key={card.cardId} card={card} />
          ))}
        </ul>
      )}

      {rest.length > 0 ? (
        <section>
          <Eyebrow>Catalogue — not ranked until added</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            These are reference cards on this device. Add one to your wallet to include it in
            comparisons.
          </p>
          <ul className="mt-3 space-y-2">
            {rest.map((card) => (
              <CatalogRow key={card.cardId} card={card} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CardRow({ card }: { card: CardView }) {
  const [pending, start] = useTransition();
  const unit = card.isCashback ? "%" : "x";

  return (
    <li>
      <Panel className="space-y-4">
        <div className="flex items-start gap-3">
          <CardSwatch slug={card.slug} artUrl={card.artUrl} colorFrom={card.colorFrom} colorTo={card.colorTo} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <Eyebrow>{card.issuer}</Eyebrow>
            <p className="text-lg font-semibold leading-tight">{card.product}</p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${card.product} from your wallet`}
            disabled={pending}
            onClick={() => start(() => void removeCardFromWallet(card.userCardId!))}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-rose/50 hover:text-rose disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Minus size={14} />}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Pill>
            {formatRate(card.baseRate)}
            {unit} base
          </Pill>
          <Pill>
            {card.currencyCode} at {card.cpp}c
          </Pill>
          <Pill tone={card.annualFeeCents > 0 ? "rose" : "brand"}>
            {card.annualFeeCents > 0 ? `${formatCents(card.annualFeeCents)}/yr` : "No annual fee"}
          </Pill>
          {card.fxFeePct > 0 ? <Pill tone="rose">{formatPct(card.fxFeePct)} abroad</Pill> : null}
        </div>

        {card.rules.length > 0 ? (
          <ul className="space-y-2.5 border-t border-line pt-3.5">
            {card.rules.map((rule) => (
              <RuleLine key={rule.id} rule={rule} unit={unit} />
            ))}
          </ul>
        ) : null}

        {card.notes ? <p className="text-xs leading-relaxed text-muted">{card.notes}</p> : null}
      </Panel>
    </li>
  );
}

function RuleLine({ rule, unit }: { rule: RuleView; unit: string }) {
  const capped = rule.capAmountCents !== null && rule.capPeriod !== "none";
  const pct = capped ? Math.min(100, (rule.capUsedCents / rule.capAmountCents!) * 100) : 0;
  const dormant = (rule.requiresActivation && !rule.activated) || (rule.selectionGroup && !rule.selected);

  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "numeral shrink-0 text-sm font-semibold",
            dormant ? "text-muted" : "text-brand",
          )}
        >
          {formatRate(rule.rate)}
          {unit}
        </span>
        <span
          className={cn("min-w-0 flex-1 truncate text-sm", dormant ? "text-muted" : "text-ink/90")}
        >
          {rule.label}
        </span>
        {rule.unverified ? (
          <ShieldAlert size={13} className="shrink-0 text-muted" aria-label="Rate not verified" />
        ) : null}
        {dormant ? <Pill>{rule.requiresActivation ? "Not activated" : "Not picked"}</Pill> : null}
      </div>

      {capped ? (
        <div className="flex items-center gap-2 pl-7">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className={cn("h-full rounded-full", pct >= 100 ? "bg-rose" : "bg-brand")}
              style={{ width: `${Math.max(pct, 1.5)}%` }}
            />
          </div>
          <span className="numeral shrink-0 text-[10px] text-muted">
            {formatCents(rule.capUsedCents)} / {formatCents(rule.capAmountCents!)} {rule.capPeriod}
          </span>
        </div>
      ) : null}
    </li>
  );
}

function CatalogRow({ card }: { card: CardView }) {
  const [pending, start] = useTransition();
  const best = card.rules.reduce((max, r) => Math.max(max, r.rate), card.baseRate);
  const unit = card.isCashback ? "%" : "x";

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface px-3.5 py-3 shadow-card">
      <CardSwatch slug={card.slug} artUrl={card.artUrl} colorFrom={card.colorFrom} colorTo={card.colorTo} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{card.product}</p>
        <p className="truncate text-xs text-muted">
          {card.issuer} · up to {formatRate(best)}
          {unit}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => start(() => void addCardToWallet(card.cardId))}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        Add
      </Button>
    </li>
  );
}