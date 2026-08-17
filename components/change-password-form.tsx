"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Input, Panel } from "@/components/ui";

export function ChangePasswordForm({ email, firstLogin }: { email: string; firstLogin: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: firstLogin ? undefined : currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not update the password.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center">
      <header className="mb-7">
        <Eyebrow>Account</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {firstLogin ? "Choose your password" : "Change password"}
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          {firstLogin
            ? `Signed in as ${email}. Replace the temporary password before using CardPilot.`
            : `Update the password for ${email}.`}
        </p>
      </header>

      <Panel>
        <form onSubmit={submit} className="space-y-3">
          {!firstLogin ? (
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Current password</span>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="text-base"
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">New password</span>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Confirm new password</span>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="text-base"
            />
          </label>
          {error ? <p className="text-sm text-rose">{error}</p> : null}
          <Button
            size="lg"
            type="submit"
            disabled={pending || newPassword.length < 8 || confirmPassword.length === 0}
          >
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Save password
          </Button>
        </form>
      </Panel>
    </div>
  );
}
