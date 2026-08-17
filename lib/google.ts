import { toBase64Url } from "@/lib/auth";

export const STATE_COOKIE = "cardpilot_oauth_state";
export const VERIFIER_COOKIE = "cardpilot_oauth_verifier";
export const RETURN_COOKIE = "cardpilot_oauth_next";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Google sign-in is available when an OAuth client is configured. Access is
 * still limited to emails that already exist in the users table.
 */
export function googleEnabled(): boolean {
  return googleConfig() !== null;
}

/** @deprecated Prefer looking up the users table. Kept for older env docs. */
export function allowedEmails(): string[] {
  return (process.env.GOOGLE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  const list = allowedEmails();
  if (list.length === 0) return true;
  return list.includes(email.trim().toLowerCase());
}

function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function createState(): string {
  return randomToken();
}

/**
 * PKCE. The verifier stays in a cookie on this device and the challenge goes to
 * Google, so an intercepted authorization code cannot be redeemed elsewhere.
 */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}

/**
 * Must match a redirect URI registered in the Google Cloud console exactly.
 * Behind Vercel's proxy the request URL is internal, so the forwarded headers
 * decide, with an explicit override for anything unusual.
 */
export function redirectUri(request: Request): string {
  const configured = process.env.AUTH_URL?.trim();
  if (configured) return `${configured.replace(/\/$/, "")}/api/auth/google/callback`;

  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(request.url).host;
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/auth/google/callback`;
}

export function authorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Skip the account chooser's "stay signed in" shortcut so switching is possible.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export class GoogleAuthError extends Error {}

/** Trades the one-time code for an ID token. */
export async function exchangeCode(options: {
  code: string;
  verifier: string;
  redirectUri: string;
  config: GoogleConfig;
}): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: options.config.clientId,
      client_secret: options.config.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
      code_verifier: options.verifier,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GoogleAuthError(`Google rejected the sign-in (${response.status}). ${detail.slice(0, 200)}`);
  }

  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) throw new GoogleAuthError("Google's response contained no identity token.");
  return body.id_token;
}

type IdTokenClaims = {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
};

export function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("Malformed identity token.");

  const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const filled = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(filled), (c) => c.charCodeAt(0))));
  } catch {
    throw new GoogleAuthError("Unreadable identity token.");
  }
}

/**
 * Returns the verified email address.
 *
 * The signature is not checked against Google's public keys because this token
 * came straight back from the token endpoint over TLS, authenticated with the
 * client secret, which OpenID Connect treats as sufficient (§3.1.3.7). The
 * claims below still have to hold: a token minted for another client, an expired
 * one, or an unverified address is refused.
 */
export function verifiedEmail(idToken: string, clientId: string, now = Date.now()): string {
  const claims = decodeIdToken(idToken);

  if (!claims.iss || !ISSUERS.includes(claims.iss)) {
    throw new GoogleAuthError("Identity token came from an unexpected issuer.");
  }
  if (claims.aud !== clientId) {
    throw new GoogleAuthError("Identity token was issued for a different application.");
  }
  if (!claims.exp || claims.exp * 1000 <= now) {
    throw new GoogleAuthError("Identity token has expired.");
  }
  if (!claims.email || claims.email_verified !== true) {
    throw new GoogleAuthError("That Google account has no verified email address.");
  }

  return claims.email.toLowerCase();
}
