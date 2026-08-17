import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authRequired, authSecret, readSession } from "@/lib/auth";
import { googleConfig } from "@/lib/google";

/**
 * With no AUTH_SECRET the app stays open (local PGlite). Once AUTH_SECRET is
 * set, every page needs a signed-in user. Accounts are provisioned by an admin
 * (or `npm run user:create`); Google only works for emails that already exist.
 */
export async function proxy(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();

  const secret = authSecret();
  const session = secret ? await readSession(request.cookies.get(AUTH_COOKIE)?.value, secret) : null;

  const { pathname, search } = request.nextUrl;

  const changingPassword =
    pathname === "/change-password" || pathname.startsWith("/api/auth/password");

  if (session?.mustChangePassword) {
    if (changingPassword || pathname.startsWith("/api/logout")) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Change your password to continue." }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/change-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (session) return NextResponse.next();

  // Google handshake and password APIs stay reachable while locked.
  if (
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/login" ||
    pathname === "/change-password"
  ) {
    return NextResponse.next();
  }

  // Hint for empty deployments: Google button only shows when configured.
  void googleConfig;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked. Sign in again." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|change-password|api/login|api/auth|manifest.webmanifest|sw.js|icons/|_next/static|_next/image|icon.svg|apple-icon|favicon.ico).*)",
  ],
};
