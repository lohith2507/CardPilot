"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, Globe, Loader2, Search, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { CardFace } from "@/components/card-face";
import { Button, Eyebrow, Input, Panel, Pill, Switch } from "@/components/ui";
import { addCardToWallet, saveExtractedCard } from "@/app/actions";
import { cardArtForName } from "@/lib/card-art";
import { searchCards, type CatalogPick, type SearchHit } from "@/lib/card-directory";
import type { ExtractedCard, ExtractedRule } from "@/lib/extract";
import { parseMccList } from "@/lib/mcc";
import { cn, formatRate } from "@/lib/utils";

type Mode = "search" | "paste" | "pdf";

export function CardImporter({ catalog }: { catalog: CatalogPick[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("search");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedCard | null>(null);
  const [addToWallet, setAddToWallet] = useState(true);
  const [saving, startSaving] = useTransition();
  const [addingId, setAddingId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const hits = useMemo(
    () => (mode === "search" ? searchCards(name, catalog) : []),
    [mode, name, catalog],
  );

  async function lookup(cardName: string) {
    setReading(true);
    setError(null);
    setName(cardName);
    try {
      const res = await fetch("/api/cards/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cardName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that card's terms.");
        return;
      }
      setDraft(data.card as ExtractedCard);
    } catch {
      setError("Network request failed. Check your connection.");
    } finally {
      setReading(false);
    }
  }

  async function read() {
    if (mode === "search") {
      // Issuer/product browse: tapping Look up only makes sense for a specific card.
      if (hits.length === 1) {
        await lookup(hits[0].lookupName);
        return;
      }
      if (hits.length > 1) {
        setError(null);
        return;
      }
      await lookup(name.trim());
      return;
    }

    setReading(true);
    setError(null);
    try {
      let res: Response;
      if (mode === "pdf" && file) {
        const form = new FormData();
        form.append("file", file);
        form.append("sourceUrl", sourceUrl);
        res = await fetch("/api/cards/extract", { method: "POST", body: form });
      } else {
        res = await fetch("/api/cards/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sourceUrl }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that card's terms.");
        return;
      }
      setDraft(data.card as ExtractedCard);
    } catch {
      setError("Network request failed. Check your connection.");
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (!draft) return;
    startSaving(async () => {
      await saveExtractedCard(draft, addToWallet);
      router.push("/cards");
    });
  }

  function addExisting(hit: SearchHit) {
    if (!hit.cardId) return;
    setAddingId(hit.cardId);
    startSaving(async () => {
      await addCardToWallet(hit.cardId!);
      router.push("/cards");
    });
  }

  const canRead =
    mode === "pdf"
      ? Boolean(file)
      : mode === "search"
        ? name.trim().length >= 2 && (hits.length <= 1 || hits.length === 0)
        : text.trim().length > 40;

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Add a card</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Save rates you trust</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Browse an issuer (for example Chase), add a known card, or look up terms from the web.
          Anything fetched by AI is a draft. Edit it before you save. Comparisons only use what you
          save.
        </p>
      </header>

      {!draft ? (
        <>
          <div className="flex gap-2">
            {(["search", "paste", "pdf"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-full border px-3 py-2.5 text-sm font-semibold transition-colors",
                  mode === m
                    ? "border-brand/30 bg-brand-soft text-brand-deep"
                    : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                {m === "search" ? "Search" : m === "paste" ? "Paste" : "PDF"}
              </button>
            ))}
          </div>

          {mode === "search" ? (
            <>
              <label className="block">
                <span className="sr-only">Card name</span>
                <div className="relative">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Chase, Amex Gold, Freedom Flex…"
                    autoComplete="off"
                    enterKeyHint="search"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canRead && !reading) void read();
                    }}
                    className="py-4 pl-11 text-base"
                  />
                </div>
              </label>

              {hits.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Eyebrow>
                      {hits.length} match{hits.length === 1 ? "" : "es"}
                    </Eyebrow>
                    {name.trim().length > 0 ? (
                      <p className="text-xs text-muted">Tap a card to add or look up terms</p>
                    ) : null}
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {hits.map((hit) => (
                      <li key={hit.slug}>
                        <CatalogPickCard
                          hit={hit}
                          busy={reading || (addingId !== null && addingId === hit.cardId)}
                          onAdd={() => addExisting(hit)}
                          onLookup={() => void lookup(hit.lookupName)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : name.trim().length >= 2 ? (
                <Panel>
                  <p className="text-sm text-muted">
                    No saved matches for &ldquo;{name.trim()}&rdquo;. Look it up on the web, or try a
                    shorter issuer name like Chase.
                  </p>
                </Panel>
              ) : null}
            </>
          ) : mode === "paste" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder="Earn 4X Membership Rewards points at restaurants worldwide, on up to $50,000 in purchases per calendar year, then 1X…"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
            />
          ) : (
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-sm text-muted transition-colors hover:border-brand/50 hover:text-ink"
              >
                <FileUp size={22} aria-hidden />
                {file ? file.name : "Choose a PDF of the card's terms"}
              </button>
              <p className="mt-2 text-xs text-muted">
                Scanned PDFs have no text layer. If nothing comes back, paste the terms instead.
              </p>
            </div>
          )}

          {mode !== "search" ? (
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Source link (optional)</span>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                className="text-sm"
              />
            </label>
          ) : null}

          {error ? (
            <Panel className="border-rose/20 bg-rose-soft">
              <p className="text-sm">{error}</p>
            </Panel>
          ) : null}

          {mode === "search" && hits.length > 1 ? null : (
            <Button size="lg" onClick={read} disabled={!canRead || reading || saving}>
              {reading ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : mode === "search" ? (
                <Globe size={16} aria-hidden />
              ) : (
                <Wand2 size={16} aria-hidden />
              )}
              {reading
                ? mode === "search"
                  ? "Looking up the current terms"
                  : "Reading the terms"
                : mode === "search"
                  ? hits.length === 1
                    ? `Look up ${hits[0].product}`
                    : "Look up this card"
                  : "Read the terms"}
            </Button>
          )}
        </>
      ) : (
        <Review
          draft={draft}
          setDraft={setDraft}
          addToWallet={addToWallet}
          setAddToWallet={setAddToWallet}
          onSave={save}
          onDiscard={() => setDraft(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function CatalogPickCard({
  hit,
  busy,
  onAdd,
  onLookup,
}: {
  hit: SearchHit;
  busy: boolean;
  onAdd: () => void;
  onLookup: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line/70 bg-surface shadow-card">
      <CardFace
        slug={hit.slug}
        artUrl={hit.artUrl}
        issuer={hit.issuer}
        product={hit.product}
        network={hit.network}
        colorFrom={hit.colorFrom}
        colorTo={hit.colorTo}
        className="rounded-none shadow-none ring-0"
      />
      <div className="space-y-2 p-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{hit.issuer}</p>
          <p className="text-sm font-semibold text-ink">{hit.product}</p>
        </div>
        <div className="flex items-center gap-2">
          {hit.inWallet ? (
            <Pill tone="brand" className="flex-1 justify-center">
              <Check size={12} aria-hidden />
              In wallet
            </Pill>
          ) : hit.readyToAdd && hit.cardId ? (
            <Button size="sm" className="flex-1" onClick={onAdd} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              Add to wallet
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={onLookup} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Globe size={14} aria-hidden />}
              Look up terms
            </Button>
          )}
          {hit.cardId && !hit.inWallet ? (
            <Button size="sm" variant="ghost" onClick={onLookup} disabled={busy} aria-label="Refresh terms">
              <Globe size={14} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Review({
  draft,
  setDraft,
  addToWallet,
  setAddToWallet,
  onSave,
  onDiscard,
  saving,
}: {
  draft: ExtractedCard;
  setDraft: (next: ExtractedCard) => void;
  addToWallet: boolean;
  setAddToWallet: (next: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const patch = (changes: Partial<ExtractedCard>) => setDraft({ ...draft, ...changes });
  const patchRule = (index: number, changes: Partial<ExtractedRule>) =>
    setDraft({
      ...draft,
      rules: draft.rules.map((r, i) => (i === index ? { ...r, ...changes } : r)),
    });
  const unit = draft.currencyIsCashback ? "%" : "x";

  return (
    <div className="space-y-6 animate-slide-up">
      <header>
        <Eyebrow>Review draft</Eyebrow>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight">Check before you save</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Rates below may be incomplete or out of date. Fix anything that looks wrong. After save,
          CardPilot treats them as the truth for ranking.
        </p>
      </header>

      <CardFace
        slug={draft.slug}
        artUrl={cardArtForName(draft.issuer, draft.product, draft.slug)}
        issuer={draft.issuer}
        product={draft.product}
        network={draft.network}
        colorFrom={draft.colorFrom}
        colorTo={draft.colorTo}
      />

      {draft.uncertainties.length > 0 ? (
        <Panel className="border-brand/20 bg-brand-soft">
          <div className="flex items-center gap-2">
            <TriangleAlert size={15} className="text-brand-deep" aria-hidden />
            <Eyebrow className="text-brand-deep">Unresolved from the lookup</Eyebrow>
          </div>
          <ul className="mt-3 space-y-1.5">
            {draft.uncertainties.map((u, i) => (
              <li key={i} className="text-xs leading-relaxed text-muted">
                {u}
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel className="border-brand/20 bg-brand-soft">
          <p className="text-xs leading-relaxed text-muted">
            No open uncertainties were flagged. Still worth a quick pass against your issuer&apos;s
            current terms.
          </p>
        </Panel>
      )}

      {draft.sources.length > 0 ? (
        <Panel>
          <Eyebrow>Looked up from</Eyebrow>
          <ul className="mt-2 space-y-1">
            {draft.sources.map((url) => (
              <li key={url} className="truncate text-xs">
                <a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {url.replace(/^https?:\/\//, "")}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="space-y-4">
        <Eyebrow>The card</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Issuer">
            <Input value={draft.issuer} onChange={(e) => patch({ issuer: e.target.value })} className="text-sm" />
          </Field>
          <Field label="Card name">
            <Input value={draft.product} onChange={(e) => patch({ product: e.target.value })} className="text-sm" />
          </Field>
          <Field label="Network">
            <Select
              value={draft.network}
              onChange={(value) => patch({ network: value as ExtractedCard["network"] })}
              options={[
                ["visa", "Visa"],
                ["mastercard", "Mastercard"],
                ["amex", "Amex"],
                ["discover", "Discover"],
              ]}
            />
          </Field>
          <Field label="Annual fee ($)">
            <NumberInput
              value={draft.annualFeeCents / 100}
              onChange={(n) => patch({ annualFeeCents: Math.round(n * 100) })}
            />
          </Field>
          <Field label={`Base rate (${unit})`}>
            <NumberInput value={draft.baseRate} onChange={(n) => patch({ baseRate: n })} />
          </Field>
          <Field label="Foreign fee (%)">
            <NumberInput value={draft.fxFeePct} onChange={(n) => patch({ fxFeePct: n })} />
          </Field>
          <Field label="Rewards currency">
            <Input
              value={draft.currencyCode}
              onChange={(e) => patch({ currencyCode: e.target.value.toUpperCase() })}
              className="text-sm"
            />
          </Field>
          <Field label="Cash value (c per point)">
            <NumberInput
              value={draft.currencyDefaultCpp}
              onChange={(n) => patch({ currencyDefaultCpp: n })}
            />
          </Field>
        </div>
      </Panel>

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Bonus categories</Eyebrow>
          <span className="numeral text-xs text-muted">{draft.rules.length}</span>
        </div>

        {draft.rules.length === 0 ? (
          <Panel className="mt-3">
            <p className="text-sm text-muted">
              No bonus categories were found, so this card will earn its base rate everywhere.
            </p>
          </Panel>
        ) : (
          <ul className="mt-3 space-y-3">
            {draft.rules.map((rule, i) => (
              <li key={i}>
                <Panel className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Input
                      value={rule.label}
                      onChange={(e) => patchRule(i, { label: e.target.value })}
                      className="flex-1 text-sm"
                      aria-label="Category name"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${rule.label}`}
                      onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })}
                      className="rounded-lg border border-line p-2.5 text-muted transition-colors hover:border-rose/50 hover:text-rose"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <Field label={`Rate (${unit})`}>
                      <NumberInput value={rule.rate} onChange={(n) => patchRule(i, { rate: n })} />
                    </Field>
                    <Field label="Cap ($)">
                      <NumberInput
                        value={(rule.capAmountCents ?? 0) / 100}
                        onChange={(n) =>
                          patchRule(i, { capAmountCents: n > 0 ? Math.round(n * 100) : null })
                        }
                      />
                    </Field>
                    <Field label="Resets">
                      <Select
                        value={rule.capPeriod}
                        onChange={(value) => patchRule(i, { capPeriod: value as ExtractedRule["capPeriod"] })}
                        options={[
                          ["none", "No cap"],
                          ["month", "Monthly"],
                          ["quarter", "Quarterly"],
                          ["year", "Yearly"],
                        ]}
                      />
                    </Field>
                  </div>

                  <Field label="Merchant category codes">
                    <Input
                      value={rule.mccCodes.join(", ")}
                      onChange={(e) => patchRule(i, { mccCodes: parseMccList(e.target.value) })}
                      placeholder="5812, 5813, 5814"
                      className="numeral text-sm"
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-3">
                    <Switch
                      checked={rule.requiresActivation}
                      onChange={(next) => patchRule(i, { requiresActivation: next })}
                      label="Needs quarterly activation"
                    />
                    {rule.merchantSlugs.length > 0 ? (
                      <Pill>{rule.merchantSlugs.join(", ")}</Pill>
                    ) : null}
                  </div>

                  {rule.notes ? (
                    <p className="text-xs leading-relaxed text-muted">{rule.notes}</p>
                  ) : null}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Panel>
        <Switch checked={addToWallet} onChange={setAddToWallet} label="Add this card to my wallet" />
      </Panel>

      <div className="space-y-2.5">
        <Button size="lg" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          Save after review: {draft.rules.length} categor
          {draft.rules.length === 1 ? "y" : "ies"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onDiscard} disabled={saving}>
          Start over
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [text, setText] = useState(() => String(value));

  return (
    <Input
      value={text}
      inputMode="decimal"
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9.]/g, "");
        setText(next);
        const parsed = Number.parseFloat(next);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setText(formatRate(value))}
      className="numeral text-sm"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink focus:border-brand focus:outline-none"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
