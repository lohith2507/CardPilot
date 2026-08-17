import { NextResponse, type NextRequest } from "next/server";
import { appPassword, AUTH_COOKIE, authSecret, readSession } from "@/lib/auth";
import { googleEnabled, isAllowed } from "@/lib/google";

/**
 * With no password and no Google client the app is wide open, which is fine on
 * localhost. Configure one before putting this anywhere public: the whole app is
 * one person's spending history.
 */
export async function proxy(request: NextRequest) {
  const password = appPassword();
  const google = googleEnabled();
  if (!password && !google) return NextResponse.next();

  const secret = authSecret();
  // Configured but unable to sign sessions: refuse rather than fall open.
  const session = secret ? await readSession(request.cookies.get(AUTH_COOKIE)?.value, secret) : null;

  const admitted =
    session !== null &&
    (session.via === "password"
      ? // A session outlives the password only until the password is removed.
        password !== null
      : // Re-checked every request, so editing the allowlist revokes access.
        google && isAllowed(session.email));

  if (admitted) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  // API callers get a status they can act on rather than a redirect to HTML.
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
    // Everything except the login screen, the sign-in endpoints, and the files a
    // locked browser still needs to render that screen or keep the app installed.
    "/((?!login|api/login|api/auth|manifest.webmanifest|sw.js|icons/|_next/static|_next/image|icon.svg|apple-icon|favicon.ico).*)",
  ],
};
