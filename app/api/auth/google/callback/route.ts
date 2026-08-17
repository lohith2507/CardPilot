import { NextResponse, type NextRequest } from "next/server";
import { authSecret, safeEqual, sessionCookie, signSession } from "@/lib/auth";
import {
  exchangeCode,
  GoogleAuthError,
  googleConfig,
  googleEnabled,
  isAllowed,
  redirectUri,
  RETURN_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  verifiedEmail,
} from "@/lib/google";
import { findUserByEmail, sessionFromUser } from "@/lib/session";
import { safeNextPath } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  const config = googleConfig();
  if (!config || !googleEnabled()) return fail("google_unconfigured");

  if (request.nextUrl.searchParams.get("error")) return fail("denied");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;

  if (!code || !state || !expectedState || !safeEqual(state, expectedState) || !verifier) {
    return fail("state");
  }

  const secret = authSecret();
  if (!secret) return fail("no_secret");

  let email: string;
  try {
    const idToken = await exchangeCode({ code, verifier, redirectUri: redirectUri(request), config });
    email = verifiedEmail(idToken, config.clientId);
  } catch (error) {
    if (error instanceof GoogleAuthError) return fail("exchange");
    throw error;
  }

  if (!isAllowed(email)) return fail("not_allowed");

  const user = await findUserByEmail(email);
  if (!user) return fail("not_allowed");

  const target = user.mustChangePassword
    ? "/change-password"
    : safeNextPath(request.cookies.get(RETURN_COOKIE)?.value);
  const response = NextResponse.redirect(new URL(target, origin));

  response.cookies.set(sessionCookie(await signSession(sessionFromUser(user, "google"), secret)));
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, RETURN_COOKIE]) {
    response.cookies.delete(name);
  }
  return response;
}
