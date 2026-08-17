import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-deep",
        outline: "border border-line bg-surface text-ink hover:bg-raised",
        ghost: "text-brand hover:bg-brand-soft",
        danger: "border border-rose/30 bg-rose-soft text-rose hover:bg-rose/10",
      },
      size: {
        sm: "px-3.5 py-1.5 text-xs",
        md: "px-5 py-2.5 text-sm",
        lg: "w-full px-5 py-3.5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-line/70 bg-surface p-5 shadow-card", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-muted/70",
        "transition-colors focus:border-brand focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** A small grey label above a section, in place of a second heading level. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Pill({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "rose" }) {
  const tones = {
    neutral: "border-line bg-raised text-muted",
    brand: "border-brand/20 bg-brand-soft text-brand-deep",
    rose: "border-rose/20 bg-rose-soft text-rose",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-sm text-ink">{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
          style={{ height: "1.25rem", width: "1.25rem" }}
        />
      </span>
    </button>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Panel className="text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{children}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Panel>
  );
}
