"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setActivation } from "@/app/actions";
import { Button, Eyebrow, Panel } from "@/components/ui";
import type { PendingActivation } from "@/lib/recommend";

export function QuarterlyChecklist({ items }: { items: PendingActivation[] }) {
  if (items.length === 0) return null;

  return (
    <Panel className="border-brand/20 bg-brand-soft/60">
      <Eyebrow className="text-brand-deep">Activate this period</Eyebrow>
      <p className="mt-1.5 text-sm text-ink">
        These rotating bonuses only count after you opt in with the issuer. Mirror that here.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <ActivationRow key={`${item.userCardId}-${item.ruleId}`} item={item} />
        ))}
      </ul>
    </Panel>
  );
}

function ActivationRow({ item }: { item: PendingActivation }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-surface/80 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">
          {item.issuer} {item.product}
        </p>
        <p className="truncate text-xs text-muted">{item.label}</p>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => setActivation(item.userCardId, item.ruleId, true))}
      >
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
        I activated it
      </Button>
    </li>
  );
}
