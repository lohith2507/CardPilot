import { cn } from "@/lib/utils";

/**
 * The arithmetic is the product's claim to trust, so every term gets its own
 * row with the figure hard right, nothing rounded away out of sight.
 */
export function Receipt({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("divide-y divide-line/70", className)}>{children}</dl>;
}

export function ReceiptRow({
  label,
  value,
  note,
  tone = "default",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "default" | "muted" | "gain" | "cost" | "total";
}) {
  const tones = {
    default: "text-ink",
    muted: "text-muted",
    gain: "text-brand",
    cost: "text-rose",
    total: "text-brand",
  };

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <dt className={cn("text-sm leading-snug", tone === "muted" ? "text-muted" : "text-ink/80")}>
          {label}
        </dt>
        <dd
          className={cn(
            "numeral shrink-0 text-sm font-semibold",
            tones[tone],
            tone === "total" && "text-base",
          )}
        >
          {value}
        </dd>
      </div>
      {note ? <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p> : null}
    </div>
  );
}

export function ReceiptNote({ children }: { children: React.ReactNode }) {
  return <p className="pt-2.5 text-xs leading-relaxed text-muted">{children}</p>;
}
