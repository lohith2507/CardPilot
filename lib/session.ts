import { cookies } from "next/headers";
import { AUTH_COOKIE, authSecret, readSession, type Session } from "@/lib/auth";

/**
 * Kept apart from lib/auth.ts because that module also runs in the proxy, where
 * next/headers is unavailable.
 */
export async function currentSession(): Promise<Session | null> {
  const secret = authSecret();
  if (!secret) return null;

  const jar = await cookies();
  return readSession(jar.get(AUTH_COOKIE)?.value, secret);
}
