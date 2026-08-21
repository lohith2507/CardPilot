"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  exportWalletAction,
  importWalletAction,
  setHouseholdCode,
  setTripMode,
} from "@/app/actions";
import { Button, Eyebrow, Input, Panel, Switch } from "@/components/ui";
import type { FeeYearSummary } from "@/lib/fee-year";
import { formatCents } from "@/lib/utils";

export function FeaturesSettings({
  tripMode,
  tripAbroadDefault,
  householdCode,
  feeYear,
}: {
  tripMode: boolean;
  tripAbroadDefault: boolean;
  householdCode: string | null;
  feeYear: FeeYearSummary[];
}) {
  const [pending, start] = useTransition();
  const [code, setCode] = useState(householdCode ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-9">
      <section>
        <Eyebrow>Trip mode</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          Defaults Compare to Abroad and highlights cards with $0 FX fee in your wallet rules.
        </p>
        <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3">
          <Switch
            label="Trip mode"
            checked={tripMode}
            onChange={(on) => start(async () => setTripMode(on, tripAbroadDefault))}
          />
        </div>
      </section>

      <section>
        <Eyebrow>Household</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          Same code on two accounts shares pinned merchants. Wallets stay separate.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. smith-house"
            className="text-sm"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setHouseholdCode(code.trim() || null);
                setMessage("Household code saved.");
              })
            }
          >
            Save
          </Button>
        </div>
      </section>

      <section>
        <Eyebrow>Fee vs logged rewards (this year)</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          Rough cash value from purchases you logged here × current point values, not issuer
          statements.
        </p>
        {feeYear.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Add cards and log spend to see this.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {feeYear.map((row) => (
              <li
                key={row.userCardId}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.product}</p>
                  <p className="text-[11px] text-muted">
                    Fee {formatCents(row.annualFeeCents)} · logged spend{" "}
                    {formatCents(row.loggedSpendCents)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="numeral text-sm font-semibold text-ink">
                    {formatCents(row.estimatedRewardsCents)}
                  </p>
                  <p
                    className={`numeral text-[11px] ${row.netVsFeeCents >= 0 ? "text-brand-deep" : "text-rose"}`}
                  >
                    {row.netVsFeeCents >= 0 ? "+" : ""}
                    {formatCents(row.netVsFeeCents)} vs fee
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Eyebrow>Export / import wallet</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          JSON backup of cards, activations, CPP, favorites, and optional transactions.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const data = await exportWalletAction(true);
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `cardpilot-wallet-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              })
            }
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : null}
            Export JSON
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              start(async () => {
                try {
                  const text = await file.text();
                  const msg = await importWalletAction(JSON.parse(text));
                  setMessage(msg);
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Import failed.");
                }
              });
            }}
          />
        </div>
        {message ? <p className="mt-2 text-xs text-muted">{message}</p> : null}
      </section>

      <Panel className="border-line/80">
        <Eyebrow>Install / share</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          Use your browser&apos;s Add to Home Screen for a PWA shortcut. From Compare, Share tip
          copies a plain-language ranking for the place you just looked up.
        </p>
      </Panel>
    </div>
  );
}
