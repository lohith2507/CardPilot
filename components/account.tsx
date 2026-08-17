import { Button, Eyebrow, Panel } from "@/components/ui";
import { authRequired } from "@/lib/auth";
import { currentSession } from "@/lib/session";

/** Nothing to show when auth is off (local open mode). */
export async function Account() {
  if (!authRequired()) return null;
  const session = await currentSession();
  if (!session) return null;

  return (
    <section>
      <Eyebrow>Account</Eyebrow>
      <Panel className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{session.email}</p>
            <p className="mt-0.5 text-xs text-muted">
              {session.via === "google" ? "Signed in with Google" : "Signed in with email"}
              {session.isAdmin ? " · Admin" : ""}
            </p>
          </div>
          <form action="/api/logout" method="post" className="shrink-0">
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </div>
        <a href="/change-password" className="block text-sm font-medium text-brand hover:underline">
          Change password
        </a>
      </Panel>
    </section>
  );
}
