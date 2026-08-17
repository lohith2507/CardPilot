import { afterEach, describe, expect, it } from "vitest";
import {
  allowedEmails,
  authorizeUrl,
  createPkce,
  createState,
  GoogleAuthError,
  googleConfig,
  googleEnabled,
  isAllowed,
  redirectUri,
  verifiedEmail,
} from "./google";
import { toBase64Url } from "./auth";

const CLIENT_ID = "123.apps.googleusercontent.com";

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  // The signature is deliberately junk: it is never checked, by design.
  return `${part({ alg: "RS256" })}.${part(claims)}.not-a-real-signature`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 600,
    email: "Owner@Example.com",
    email_verified: true,
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_ALLOWED_EMAILS;
  delete process.env.AUTH_URL;
});

describe("configuration", () => {
  it("needs both halves of the client credentials", () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    expect(googleConfig()).toBeNull();

    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(googleConfig()).toEqual({ clientId: CLIENT_ID, clientSecret: "secret" });
  });

  it("turns on once OAuth client credentials exist", () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(googleEnabled()).toBe(true);
  });
});

describe("optional env allowlist", () => {
  it("ignores case and surrounding spaces when set", () => {
    process.env.GOOGLE_ALLOWED_EMAILS = " Owner@Example.com , second@example.com ";
    expect(allowedEmails()).toEqual(["owner@example.com", "second@example.com"]);
    expect(isAllowed("OWNER@EXAMPLE.COM")).toBe(true);
    expect(isAllowed(" second@example.com ")).toBe(true);
  });

  it("admits everyone when empty (users table is the real gate)", () => {
    expect(isAllowed("anyone@example.com")).toBe(true);
    process.env.GOOGLE_ALLOWED_EMAILS = "";
    expect(isAllowed("anyone@example.com")).toBe(true);
  });

  it("denies a missing address", () => {
    process.env.GOOGLE_ALLOWED_EMAILS = "owner@example.com";
    expect(isAllowed(undefined)).toBe(false);
    expect(isAllowed(null)).toBe(false);
    expect(isAllowed("")).toBe(false);
  });

  it("does not admit a lookalike address when the list is set", () => {
    process.env.GOOGLE_ALLOWED_EMAILS = "owner@example.com";
    expect(isAllowed("owner@example.com.attacker.test")).toBe(false);
    expect(isAllowed("notowner@example.com")).toBe(false);
  });
});

describe("identity tokens", () => {
  it("accepts a well-formed token and normalises the address", () => {
    expect(verifiedEmail(idToken(validClaims()), CLIENT_ID)).toBe("owner@example.com");
  });

  it("refuses a token minted for a different client", () => {
    const token = idToken(validClaims({ aud: "999.apps.googleusercontent.com" }));
    expect(() => verifiedEmail(token, CLIENT_ID)).toThrow(GoogleAuthError);
  });

  it("refuses an expired token", () => {
    const token = idToken(validClaims({ exp: Math.floor(Date.now() / 1000) - 1 }));
    expect(() => verifiedEmail(token, CLIENT_ID)).toThrow(/expired/i);
  });

  it("refuses an unverified address", () => {
    const token = idToken(validClaims({ email_verified: false }));
    expect(() => verifiedEmail(token, CLIENT_ID)).toThrow(/verified/i);
  });

  it("refuses an unexpected issuer", () => {
    const token = idToken(validClaims({ iss: "https://accounts.attacker.test" }));
    expect(() => verifiedEmail(token, CLIENT_ID)).toThrow(/issuer/i);
  });

  it("refuses tokens that are not tokens", () => {
    expect(() => verifiedEmail("nonsense", CLIENT_ID)).toThrow(GoogleAuthError);
    expect(() => verifiedEmail("a.b", CLIENT_ID)).toThrow(GoogleAuthError);
    expect(() => verifiedEmail("a.!!!.c", CLIENT_ID)).toThrow(GoogleAuthError);
  });

  it("accepts the bare issuer spelling Google also uses", () => {
    const token = idToken(validClaims({ iss: "accounts.google.com" }));
    expect(verifiedEmail(token, CLIENT_ID)).toBe("owner@example.com");
  });
});

describe("the handshake", () => {
  it("derives the PKCE challenge as the SHA-256 of the verifier", async () => {
    const { verifier, challenge } = await createPkce();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

    expect(challenge).toBe(toBase64Url(new Uint8Array(digest)));
    // Base64url only: nothing needing escaping in a query string.
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat state between attempts", () => {
    const seen = new Set(Array.from({ length: 50 }, () => createState()));
    expect(seen.size).toBe(50);
  });

  it("asks Google for exactly what it needs", () => {
    const url = new URL(
      authorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: "https://cardpilot.test/api/auth/google/callback",
        state: "state-value",
        challenge: "challenge-value",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("the redirect URI", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://internal.local/api/auth/google/start", { headers });

  it("follows the forwarded host, which is what the browser actually used", () => {
    const uri = redirectUri(request({ "x-forwarded-host": "cardpilot.vercel.app", "x-forwarded-proto": "https" }));
    expect(uri).toBe("https://cardpilot.vercel.app/api/auth/google/callback");
  });

  it("stays on http for localhost so local sign-in works", () => {
    expect(redirectUri(request({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });

  it("prefers an explicit override and tolerates a trailing slash", () => {
    process.env.AUTH_URL = "https://cards.example.com/";
    expect(redirectUri(request({ host: "localhost:3000" }))).toBe(
      "https://cards.example.com/api/auth/google/callback",
    );
  });
});
