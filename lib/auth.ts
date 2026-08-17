export const AUTH_COOKIE = "cardpilot_session";

/** Who is signed in, and by which route. */
export type Session = {
  via: "password" | "google";
  userId: number;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  /** Issued-at, seconds. */
  iat: number;
};

const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const filled = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return Uint8Array.from(atob(filled), (c) => c.charCodeAt(0));
}

/** Web Crypto only: this also runs in the proxy, which is not a Node runtime. */
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function sign(payload: string, secret: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `payload.signature`, where the payload is readable but not forgeable. The
 * browser never receives the signing secret, so a tampered payload fails the
 * comparison below.
 */
export async function signSession(session: Omit<Session, "iat">, secret: string): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        via: session.via,
        userId: session.userId,
        email: session.email,
        isAdmin: session.isAdmin,
        mustChangePassword: session.mustChangePassword,
        iat: Math.floor(Date.now() / 1000),
      }),
    ),
  );
  return `${payload}.${await sign(payload, secret)}`;
}

/** Returns null for anything unsigned, tampered with, or unreadable. */
export async function readSession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;

  const split = token.lastIndexOf(".");
  if (split <= 0) return null;

  const payload = token.slice(0, split);
  const provided = token.slice(split + 1);
  if (!safeEqual(provided, await sign(payload, secret))) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (parsed.via !== "password" && parsed.via !== "google") return null;
    if (!parsed.email || typeof parsed.userId !== "number" || !Number.isFinite(parsed.userId)) {
      return null;
    }
    return {
      via: parsed.via,
      userId: parsed.userId,
      email: parsed.email,
      isAdmin: Boolean(parsed.isAdmin),
      mustChangePassword: Boolean(parsed.mustChangePassword),
      iat: parsed.iat,
    };
  } catch {
    return null;
  }
}

/**
 * `lax` rather than `strict` because the browser arrives back from Google's
 * domain on a top-level redirect and must bring the cookie with it.
 */
export function sessionCookie(value: string) {
  return {
    name: AUTH_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

/** Constant-time so a wrong guess reveals nothing through timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * When AUTH_SECRET is set, the app requires a signed-in user. Localhost can
 * leave it empty and stay open for PGlite development.
 */
export function authRequired(): boolean {
  return Boolean(process.env.AUTH_SECRET?.trim());
}

/** Signs sessions. Required whenever the gate is on. */
export function authSecret(): string | null {
  const explicit = process.env.AUTH_SECRET?.trim();
  return explicit ? explicit : null;
}
