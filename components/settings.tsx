"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { CardSwatch } from "@/components/card-face";
import { Button, Eyebrow, EmptyState, Input, Panel, Pill, Switch } from "@/components/ui";
import type { CardView, RuleView } from "@/components/wallet";
import {
  deleteSignupBonus,
  deleteTransaction,
  saveSignupBonus,
  setActivation,
  setSelection,
  setUserCpp,
  verifyRule,
} from "@/app/actions";
import { cn, formatCents, formatRate } from "@/lib/utils";

export type CurrencyView = {
  id: number;
  code: string;
  name: string;
  defaultCpp: number;
  userCpp: number | null;
  isCashback: boolean;
  notes: string | null;
  /** Cards in your wallet that earn this currency. */
  usedBy: string[];
};

export type SubView = {
  userCardId: number;
  requiredSpendCents: number;
  bonusValueCents: number;
  startedAt: string;
  deadline: string;
  preloggedSpendCents: number;
  spentCents: number;
};

export type TxView = {
  id: number;
  merchantName: string;
  mcc: number;
  amountCents: number;
  occurredAt: string;
  product: string;
  colorFrom: string | null;
  colorTo: string | null;
};

export function Settings({
  currencies,
  cards,
  subs,
  transactions,
}: {
  currencies: CurrencyView[];
  cards: CardView[];
  subs: SubView[];
  transactions: TxView[];
}) {
  const rotating = cards.filter((c) => c.rules.some((r) => r.requiresActivation));
  const selectable = cards.filter((c) => c.rules.some((r) => r.selectionGroup));

  return (
    <div className="space-y-9">
      <header>
        <Eyebrow>Settings</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">How estimates are valued</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          These inputs change the dollar estimate on Compare. They are your assumptions, not market
          prices or advice.
        </p>
      </header>

      <section>
        <Eyebrow>What a point is worth to you</Eyebrow>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This number decides whether a points card beats flat cash back in the ranking. Set it to
          what you usually get when you redeem, not a best-case transfer partner rate unless that
          is what you actually use.
        </p>
        <ul className="mt-4 space-y-3">
          {currencies.map((currency) => (
            <CurrencyRow key={currency.id} currency={currency} />
          ))}
        </ul>
      </section>

      {rotating.length > 0 ? (
        <section>
          <Eyebrow>Rotating categories</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            These earn nothing extra until you opt in on the issuer&apos;s site each quarter. Mirror
            that here so the estimate matches what you activated. CardPilot cannot see the issuer
            portal.
          </p>
          <ul className="mt-4 space-y-3">
            {rotating.map((card) => (
              <ActivationCard key={card.cardId} card={card} />
            ))}
          </ul>
        </section>
      ) : null}

      {cards.some((c) => c.rules.some((r) => r.unverified)) ? (
        <section>
          <Eyebrow>Rule freshness</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Unverified rates came from a lookup or seed. Mark verified after you confirm with the
            issuer, or look the card up again under Add a card.
          </p>
          <ul className="mt-3 space-y-2">
            {cards.flatMap((card) =>
              card.rules
                .filter((r) => r.unverified)
                .map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{card.product}</p>
                      <p className="truncate text-xs text-muted">{rule.label}</p>
                    </div>
                    <VerifyRuleButton ruleId={rule.id} />
                  </li>
                )),
            )}
          </ul>
        </section>
      ) : null}

      {selectable.length > 0 ? (
        <section>
          <Eyebrow>Chosen categories</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            These cards pay the bonus rate in one category at a time.
          </p>
          <ul className="mt-4 space-y-3">
            {selectable.map((card) => (
              <SelectionCard key={card.cardId} card={card} />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <Eyebrow>Signup bonuses</Eyebrow>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          While a minimum spend is open, that card often wins every purchase in the estimate. Track
          it here so the ranking accounts for the bonus. Still confirm terms with the issuer.
        </p>
        {cards.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No cards yet">Add a card to your wallet first.</EmptyState>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {cards.map((card) => (
              <SubCard
                key={card.cardId}
                card={card}
                sub={subs.find((s) => s.userCardId === card.userCardId) ?? null}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <Eyebrow>Logged purchases</Eyebrow>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Cap tracking is only as good as this list. Remove anything logged by mistake.
        </p>
        {transactions.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nothing logged yet">
              Log a purchase after a recommendation and it will show up here.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </section>

      <Panel className="border-brand/20 bg-brand-soft">
        <Eyebrow className="text-brand-deep">About rates in this app</Eyebrow>
        <p className="mt-2.5 text-xs leading-relaxed text-muted">
          Seeded and AI-looked-up rates are not continuously verified. Rotating categories in
          particular go stale. Confirm anything that matters against your issuer, and use{" "}
          <span className="font-medium text-ink">Add a card</span> to refresh terms after you review
          them. CardPilot is not financial advice.
        </p>
      </Panel>
    </div>
  );
}

function VerifyRuleButton({ ruleId }: { ruleId: number }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => void verifyRule(ruleId))}>
      {pending ? <Loader2 size={13} className="animate-spin" /> : null}
      Mark verified
    </Button>
  );
}

function CurrencyRow({ currency }: { currency: CurrencyView }) {
  const effective = currency.userCpp ?? currency.defaultCpp;
  const [text, setText] = useState(String(effective));
  const [pending, start] = useTransition();

  // Written back after typing settles so every keystroke isn't a round trip.
  useEffect(() => {
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed) || parsed === effective) return;
    const timer = setTimeout(() => {
      start(() => void setUserCpp(currency.id, parsed));
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <li>
      <Panel className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold">{currency.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {currency.isCashback
                ? "Cash back is always worth exactly one cent."
                : `Cash out value is ${currency.defaultCpp}c.`}
            </p>
          </div>
          <Pill tone={currency.isCashback ? "neutral" : "brand"}>{currency.code}</Pill>
        </div>

        {currency.isCashback ? null : (
          <label className="flex items-center gap-3">
            <span className="flex-1 text-sm text-ink">Your valuation</span>
            <span className="relative w-28">
              <Input
                value={text}
                inputMode="decimal"
                onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
                className="numeral py-2 pr-7 text-right text-sm"
                aria-label={`Cents per ${currency.code} point`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                {pending ? <Loader2 size={11} className="animate-spin" /> : "c"}
              </span>
            </span>
          </label>
        )}

        {currency.usedBy.length > 0 ? (
          <p className="text-xs text-muted">Used by {currency.usedBy.join(", ")}</p>
        ) : null}
      </Panel>
    </li>
  );
}

function ActivationCard({ card }: { card: CardView }) {
  const rules = card.rules.filter((r) => r.requiresActivation);
  return (
    <li>
      <Panel className="space-y-3.5">
        <CardHeading card={card} />
        {rules.map((rule) => (
          <ActivationToggle key={rule.id} card={card} rule={rule} />
        ))}
      </Panel>
    </li>
  );
}

function ActivationToggle({ card, rule }: { card: CardView; rule: RuleView }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3">
      <Switch
        checked={rule.activated}
        onChange={(next) => start(() => void setActivation(card.userCardId!, rule.id, next))}
        label={`${formatRate(rule.rate)}${card.isCashback ? "%" : "x"} ${rule.label}`}
      />
      {pending ? <Loader2 size={13} className="animate-spin text-brand" /> : null}
    </div>
  );
}

function SelectionCard({ card }: { card: CardView }) {
  const [pending, start] = useTransition();
  const groups = [...new Set(card.rules.map((r) => r.selectionGroup).filter(Boolean))] as string[];

  return (
    <li>
      <Panel className="space-y-3.5">
        <CardHeading card={card} />
        {groups.map((group) => {
          const options = card.rules.filter((r) => r.selectionGroup === group);
          const current = options.find((r) => r.selected)?.id ?? 0;
          return (
            <label key={group} className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs text-muted">
                This cycle&apos;s bonus category
                {pending ? <Loader2 size={11} className="animate-spin text-brand" /> : null}
              </span>
              <select
                value={String(current)}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  start(() => void setSelection(card.userCardId!, group, value || null));
                }}
                className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink focus:border-brand focus:outline-none"
              >
                <option value="0">Not picked: earns the base rate</option>
                {options.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {formatRate(r.rate)}
                    {card.isCashback ? "%" : "x"} {r.label.replace(/^\d+x:\s*/, "")}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </Panel>
    </li>
  );
}

function SubCard({ card, sub }: { card: CardView; sub: SubView | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    requiredSpend: sub ? String(sub.requiredSpendCents / 100) : "4000",
    bonusValue: sub ? String(sub.bonusValueCents / 100) : "600",
    startedAt: sub?.startedAt ?? new Date().toISOString().slice(0, 10),
    deadline: sub?.deadline ?? addMonths(new Date(), 3).toISOString().slice(0, 10),
    prelogged: sub ? String(sub.preloggedSpendCents / 100) : "0",
  });

  function submit() {
    start(async () => {
      await saveSignupBonus({
        userCardId: card.userCardId!,
        requiredSpendCents: Math.round((Number.parseFloat(form.requiredSpend) || 0) * 100),
        bonusValueCents: Math.round((Number.parseFloat(form.bonusValue) || 0) * 100),
        startedAt: form.startedAt,
        deadline: form.deadline,
        preloggedSpendCents: Math.round((Number.parseFloat(form.prelogged) || 0) * 100),
      });
      setOpen(false);
    });
  }

  const progress = sub ? Math.min(100, (sub.spentCents / sub.requiredSpendCents) * 100) : 0;

  return (
    <li>
      <Panel className="space-y-3.5">
        <CardHeading card={card} />

        {sub && !open ? (
          <>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className={cn("h-full rounded-full", progress >= 100 ? "bg-brand" : "bg-brand/60")}
                  style={{ width: `${Math.max(progress, 2)}%` }}
                />
              </div>
              <span className="numeral shrink-0 text-[11px] text-muted">
                {formatCents(sub.spentCents)} / {formatCents(sub.requiredSpendCents)}
              </span>
            </div>
            <p className="text-xs text-muted">
              {formatCents(sub.bonusValueCents)} bonus, deadline {sub.deadline}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => start(() => void deleteSignupBonus(card.userCardId!))}
              >
                Remove
              </Button>
            </div>
          </>
        ) : null}

        {!sub && !open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Track a signup bonus
          </Button>
        ) : null}

        {open ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SubField label="Minimum spend ($)">
                <Input
                  value={form.requiredSpend}
                  inputMode="decimal"
                  onChange={(e) => setForm({ ...form, requiredSpend: e.target.value.replace(/[^0-9.]/g, "") })}
                  className="numeral text-sm"
                />
              </SubField>
              <SubField label="Bonus worth ($)">
                <Input
                  value={form.bonusValue}
                  inputMode="decimal"
                  onChange={(e) => setForm({ ...form, bonusValue: e.target.value.replace(/[^0-9.]/g, "") })}
                  className="numeral text-sm"
                />
              </SubField>
              <SubField label="Window opened">
                <Input
                  type="date"
                  value={form.startedAt}
                  onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
                  className="text-sm"
                />
              </SubField>
              <SubField label="Deadline">
                <Input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="text-sm"
                />
              </SubField>
            </div>
            <SubField label="Already spent before logging here ($)">
              <Input
                value={form.prelogged}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, prelogged: e.target.value.replace(/[^0-9.]/g, "") })}
                className="numeral text-sm"
              />
            </SubField>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={pending}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : null}
                Save bonus
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>
    </li>
  );
}

function SubField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function CardHeading({ card }: { card: CardView }) {
  return (
    <div className="flex items-center gap-3">
      <CardSwatch slug={card.slug} artUrl={card.artUrl} colorFrom={card.colorFrom} colorTo={card.colorTo} />
      <div className="min-w-0">
        <Eyebrow>{card.issuer}</Eyebrow>
        <p className="truncate text-base font-semibold leading-tight">{card.product}</p>
      </div>
    </div>
  );
}

function TransactionRow({ tx }: { tx: TxView }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface px-3.5 py-3 shadow-card">
      <CardSwatch colorFrom={tx.colorFrom} colorTo={tx.colorTo} className="h-7 w-5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{tx.merchantName}</p>
        <p className="truncate text-xs text-muted">
          {tx.product} · {new Date(tx.occurredAt).toLocaleDateString()}
        </p>
      </div>
      <span className="numeral shrink-0 text-sm">{formatCents(tx.amountCents)}</span>
      <button
        type="button"
        aria-label={`Remove ${tx.merchantName} purchase`}
        disabled={pending}
        onClick={() => start(() => void deleteTransaction(tx.id))}
        className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-rose/50 hover:text-rose disabled:opacity-50"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </li>
  );
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
