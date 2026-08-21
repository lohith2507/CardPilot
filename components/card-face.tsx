import { cardArtForSlug } from "@/lib/card-art";
import { cn } from "@/lib/utils";

const NETWORK_MARK: Record<string, string> = {
  visa: "VISA",
  mastercard: "MASTERCARD",
  amex: "AMERICAN EXPRESS",
  discover: "DISCOVER",
};

export type CardFaceProps = {
  slug?: string | null;
  artUrl?: string | null;
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
  slug,
  artUrl,
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
  const resolvedArt = artUrl ?? cardArtForSlug(slug);
  const hasArt = Boolean(resolvedArt);
  // When we have real card art and no rate headline, show the face alone —
  // issuer branding is already in the image.
  const artOnly = hasArt && !headline;

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-card shadow-lifted",
        "ring-1 ring-inset ring-white/15",
        artOnly ? "aspect-[1.586/1]" : "p-5",
        className,
      )}
      style={{ background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)` }}
    >
      {hasArt ? (
        <>
          <img
            src={resolvedArt ?? ""}
            alt={`${issuer} ${product} card art`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          {!artOnly ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-white/5"
            />
          ) : null}
        </>
      ) : null}

      {!artOnly ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(120% 90% at 12% 0%, rgb(255 255 255 / 0.22), transparent 55%)",
            }}
          />

          <p className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
            {issuer}
          </p>
          <p className="relative mt-0.5 text-xl font-semibold text-white">{product}</p>

          {headline ? (
            <div className="relative mt-7 flex items-end justify-between gap-3">
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
            <p className="relative mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
              {NETWORK_MARK[network] ?? network}
            </p>
          )}
        </>
      ) : null}
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
  slug,
  artUrl,
  colorFrom,
  colorTo,
  className,
}: {
  slug?: string | null;
  artUrl?: string | null;
  colorFrom: string | null;
  colorTo: string | null;
  className?: string;
}) {
  const resolvedArt = artUrl ?? cardArtForSlug(slug);
  return (
    <span
      aria-hidden
      className={cn("relative h-9 w-6 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-white/20", className)}
      style={{
        background: `linear-gradient(145deg, ${colorFrom ?? "#2b3547"} 0%, ${colorTo ?? "#141b26"} 100%)`,
      }}
    >
      {resolvedArt ? (
        <img
          src={resolvedArt}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : null}
    </span>
  );
}
