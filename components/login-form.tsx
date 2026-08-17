"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GoogleMark } from "@/components/google-mark";
import { Button, Eyebrow, Input, Panel } from "@/components/ui";
import { safeNextPath } from "@/lib/utils";

const FAILURES: Record<string, string> = {
  denied: "Sign-in was cancelled.",
  state: "That sign-in attempt expired. Try again.",
  exchange: "Google could not complete the sign-in.",
  not_allowed: "That Google account is not on the allowlist for this app.",
  google_unconfigured: "Google sign-in is not configured.",
  no_secret: "Sessions cannot be signed. Set AUTH_SECRET and restart.",
};

export function LoginForm({ google, password }: { google: boolean; password: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const failure = FAILURES[params.get("error") ?? ""] ?? null;

  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: secret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That password is wrong.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col justify-center">
      <header className="mb-7 text-center">
        <Eyebrow>CardPilot</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-2.5 text-sm text-muted">
          Protects the wallet and purchase log on this device. Estimates stay personal to you.
        </p>
      </header>

      {failure ? (
        <p role="alert" className="mb-4 rounded-xl border border-rose/20 bg-rose-soft px-4 py-3 text-sm text-rose">
          {failure}
        </p>
      ) : null}

      <Panel className="space-y-4">
        {google ? (
          <a
            href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-surface px-5 py-3.5 text-base font-semibold text-ink shadow-card transition-colors hover:bg-raised active:scale-[0.98]"
          >
            <GoogleMark />
            Continue with Google
          </a>
        ) : null}

        {google && password ? (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              or
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        ) : null}

        {password ? (
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Password</span>
              <Input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="current-password"
                autoFocus={!google}
                className="text-base"
              />
            </label>

            {error ? <p className="text-sm text-rose">{error}</p> : null}

            <Button size="lg" type="submit" disabled={pending || secret.length === 0}>
              {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              Continue
            </Button>
          </form>
        ) : null}

        {!google && !password ? (
          <p className="text-sm leading-relaxed text-muted">
            No sign-in method is configured. Set{" "}
            <code className="rounded bg-raised px-1 py-0.5 text-ink">APP_PASSWORD</code>, or a
            Google client together with{" "}
            <code className="rounded bg-raised px-1 py-0.5 text-ink">GOOGLE_ALLOWED_EMAILS</code>.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
