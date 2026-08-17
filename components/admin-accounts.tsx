"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createUserAccount } from "@/app/actions/users";
import { Button, Eyebrow, EmptyState, Input, Panel, Pill, Switch } from "@/components/ui";

export type AdminUserRow = {
  id: number;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: Date | string;
};

export function AdminAccounts({ users }: { users: AdminUserRow[] }) {
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    start(async () => {
      const result = await createUserAccount({ email, temporaryPassword, isAdmin });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Created ${result.email}. They must change the password on first sign-in.`);
      setEmail("");
      setTemporaryPassword("");
      setIsAdmin(false);
    });
  }

  return (
    <section className="space-y-4">
      <header>
        <Eyebrow>Accounts</Eyebrow>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight">Create users</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Accounts are created here (or via CLI). There is no self-registration. Google works only
          for emails that already exist.
        </p>
      </header>

      <Panel>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Temporary password</span>
            <Input
              type="text"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              className="text-sm"
              minLength={8}
              required
            />
          </label>
          <Switch checked={isAdmin} onChange={setIsAdmin} label="Admin (can create accounts)" />
          {error ? <p className="text-sm text-rose">{error}</p> : null}
          {message ? <p className="text-sm text-brand-deep">{message}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Create account
          </Button>
        </form>
      </Panel>

      {users.length === 0 ? (
        <EmptyState title="No accounts yet">Create the first user above.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{user.email}</p>
                <p className="text-xs text-muted">
                  {user.mustChangePassword ? "Must change password" : "Password set"}
                </p>
              </div>
              {user.isAdmin ? <Pill tone="brand">Admin</Pill> : <Pill>User</Pill>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
