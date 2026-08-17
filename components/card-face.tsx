import { cn } from "@/lib/utils";

const NETWORK_MARK: Record<string, string> = {
  visa: "VISA",
  mastercard: "MASTERCARD",
  amex: "AMERICAN EXPRESS",
  discover: "DISCOVER",
};

export type CardFaceProps = {
  issuer: string;
  product: string;
  network: string;
  colorFrom: string | null;
  colorTo: string | null;
  /** Rendered large on the card face, e.g. "7.2%". */
  headline?: string;
  headlineLabel?: string;
  className?: string;
};

/**
 * The answer is a physical object, so the recommendation is rendered as one:
 * the card that ranked highest for this estimate, at a size you can recognise from
 * arm's length, with its rate set into the face.
 */
export function CardFace({
  issuer,
  product,
  network,
  colorFrom,
  colorTo,
  headline,
  headlineLabel,
  className,
}: CardFaceProps) {
  const from = colorFrom ?? "#2b3547";
  const to = colorTo ?? "#141b26";

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-card p-5 shadow-lifted",
        "ring-1 ring-inset ring-white/15",
        className,
      )}
      style={{ background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)` }}
    >
      {/* Light catching the top-left corner, the way a real card does. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 12% 0%, rgb(255 255 255 / 0.22), transparent 55%)",
        }}
      />

      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
        {issuer}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-white">{product}</p>

      {headline ? (
        <div className="mt-7 flex items-end justify-between gap-3">
          <div>
            <p className="numeral text-[3.25rem] font-semibold leading-none text-white">
              {headline}
            </p>
            {headlineLabel ? (
              <p className="mt-1.5 text-xs text-white/75">{headlineLabel}</p>
            ) : null}
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
            {NETWORK_MARK[network] ?? network}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
          {NETWORK_MARK[network] ?? network}
        </p>
      )}
    </div>
  );
}

/** A colour-only sliver, used to fan the runners-up behind the winner. */
export function CardSliver({
  colorFrom,
  colorTo,
  className,
  style,
}: {
  colorFrom: string | null;
  colorTo: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-x-0 top-0 h-full rounded-card ring-1 ring-inset ring-white/10", className)}
      style={{
        background: `linear-gradient(145deg, ${colorFrom ?? "#2b3547"} 0%, ${colorTo ?? "#141b26"} 100%)`,
        ...style,
      }}
    />
  );
}

export function CardSwatch({
  colorFrom,
  colorTo,
  className,
}: {
  colorFrom: string | null;
  colorTo: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("h-9 w-6 shrink-0 rounded-md ring-1 ring-inset ring-white/20", className)}
      style={{
        background: `linear-gradient(145deg, ${colorFrom ?? "#2b3547"} 0%, ${colorTo ?? "#141b26"} 100%)`,
      }}
    />
  );
}
