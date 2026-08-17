import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeUrl,
  createPkce,
  createState,
  googleConfig,
  googleEnabled,
  redirectUri,
  RETURN_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "@/lib/google";
import { safeNextPath } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough to finish signing in, short enough not to linger. */
const HANDSHAKE_MAX_AGE = 60 * 10;

function handshakeCookie(name: string, value: string) {
  return {
    name,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HANDSHAKE_MAX_AGE,
  };
}

export async function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config || !googleEnabled()) {
    return NextResponse.redirect(new URL("/login?error=google_unconfigured", request.nextUrl.origin));
  }

  const state = createState();
  const { verifier, challenge } = await createPkce();
  // Same-site only, so this cannot be used to bounce someone off-site.
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  const response = NextResponse.redirect(
    authorizeUrl({
      clientId: config.clientId,
      redirectUri: redirectUri(request),
      state,
      challenge,
    }),
  );

  response.cookies.set(handshakeCookie(STATE_COOKIE, state));
  response.cookies.set(handshakeCookie(VERIFIER_COOKIE, verifier));
  response.cookies.set(handshakeCookie(RETURN_COOKIE, next));
  return response;
}
