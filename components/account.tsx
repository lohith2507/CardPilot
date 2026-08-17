import { Button, Eyebrow, Panel } from "@/components/ui";
import { currentSession } from "@/lib/session";

/** Nothing to show when no sign-in method is configured, as on localhost. */
export async function Account() {
  const session = await currentSession();
  if (!session) return null;

  return (
    <section>
      <Eyebrow>Account</Eyebrow>
      <Panel className="mt-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {session.email ?? "Shared password"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {session.via === "google" ? "Signed in with Google" : "Signed in with the shared password"}
          </p>
        </div>
        {/* A plain form, so signing out does not depend on client JavaScript. */}
        <form action="/api/logout" method="post" className="shrink-0">
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </Panel>
    </section>
  );
}
