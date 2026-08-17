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
  not_allowed: "No CardPilot account exists for that Google address. Ask an admin to create one.",
  google_unconfigured: "Google sign-in is not configured.",
  no_secret: "Sessions cannot be signed. Set AUTH_SECRET and restart.",
};

export function LoginForm({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const failure = FAILURES[params.get("error") ?? ""] ?? null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      router.replace(data.mustChangePassword ? "/change-password" : next);
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
          Use the email an admin set up for you, or Google if that address already has an account.
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

        {google ? (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              or
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus={!google}
              className="text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="text-base"
            />
          </label>

          {error ? <p className="text-sm text-rose">{error}</p> : null}

          <Button size="lg" type="submit" disabled={pending || email.length === 0 || password.length === 0}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Continue
          </Button>
        </form>
      </Panel>
    </div>
  );
}
