import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { POST as login } from "@/app/api/login/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { GET as start } from "@/app/api/auth/google/start/route";
import { AUTH_COOKIE, readSession, safeEqual, signSession } from "@/lib/auth";
import { RETURN_COOKIE, STATE_COOKIE, VERIFIER_COOKIE } from "@/lib/google";
import { safeNextPath } from "@/lib/utils";

const PASSWORD = "correct horse battery staple";
const SECRET = "0123456789abcdef0123456789abcdef";
const OWNER = "owner@example.com";

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(new URL(`https://cardpilot.test${path}`));
  if (cookie) req.cookies.set(AUTH_COOKIE, cookie);
  return req;
}

function enableGoogle(emails = OWNER) {
  process.env.GOOGLE_CLIENT_ID = "123.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_ALLOWED_EMAILS = emails;
  process.env.AUTH_SECRET = SECRET;
}

afterEach(() => {
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_ALLOWED_EMAILS;
});

describe("session tokens", () => {
  it("round-trips what was put in", async () => {
    const token = await signSession({ via: "google", email: OWNER }, SECRET);
    const session = await readSession(token, SECRET);

    expect(session).toMatchObject({ via: "google", email: OWNER });
    expect(session?.iat).toBeTypeOf("number");
  });

  it("never contains the signing secret or a password", async () => {
    const token = await signSession({ via: "password" }, PASSWORD);
    expect(token).not.toContain("horse");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ via: "password" }, SECRET);
    expect(await readSession(token, `${SECRET}x`)).toBeNull();
  });

  it("rejects a payload edited after signing", async () => {
    const token = await signSession({ via: "google", email: OWNER }, SECRET);
    const forged = await signSession({ via: "google", email: "attacker@example.com" }, SECRET);

    // Keep the real signature, swap in the other payload.
    const spliced = `${forged.split(".")[0]}.${token.split(".")[1]}`;
    expect(await readSession(spliced, SECRET)).toBeNull();
  });

  it("rejects malformed and empty tokens", async () => {
    for (const value of ["", "nonsense", "no-dot-separator", ".", "a.b.c"]) {
      expect(await readSession(value, SECRET)).toBeNull();
    }
    expect(await readSession(undefined, SECRET)).toBeNull();
  });

  it("rejects a Google session with no address to check", async () => {
    // Signed correctly, but there is nothing to compare to the allowlist.
    const token = await signSession({ via: "google" }, SECRET);
    expect(await readSession(token, SECRET)).toBeNull();
  });

  it("compares without leaking length mismatches as equality", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("the gate", () => {
  it("lets everything through when nothing is configured", async () => {
    const res = await proxy(request("/cards"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a locked browser to the login screen and remembers where it was going", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const res = await proxy(request("/settings"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/settings");
  });

  it("does not add a redirect target for the home page", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const res = await proxy(request("/"));
    expect(new URL(res.headers.get("location")!).search).toBe("");
  });

  it("answers API calls with 401 rather than an HTML redirect", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const res = await proxy(request("/api/recommend"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("admits a password session", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const token = await signSession({ via: "password" }, PASSWORD);
    expect((await proxy(request("/cards", token))).status).toBe(200);
  });

  it("rejects a forged cookie", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const res = await proxy(request("/cards", await signSession({ via: "password" }, "guess")));
    expect(res.status).toBe(307);
  });

  it("locks everything when configured but unable to sign sessions", async () => {
    // Google on, but no AUTH_SECRET and no password to borrow: fail closed.
    process.env.GOOGLE_CLIENT_ID = "123.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_ALLOWED_EMAILS = OWNER;

    const res = await proxy(request("/cards", await signSession({ via: "google", email: OWNER }, SECRET)));
    expect(res.status).toBe(307);
  });
});

describe("Google sessions", () => {
  it("admits an allowlisted address", async () => {
    enableGoogle();
    const token = await signSession({ via: "google", email: OWNER }, SECRET);
    expect((await proxy(request("/cards", token))).status).toBe(200);
  });

  it("revokes an existing session once the address leaves the allowlist", async () => {
    enableGoogle();
    const token = await signSession({ via: "google", email: OWNER }, SECRET);
    expect((await proxy(request("/cards", token))).status).toBe(200);

    // Same valid, correctly signed cookie — but no longer a permitted address.
    process.env.GOOGLE_ALLOWED_EMAILS = "someone-else@example.com";
    expect((await proxy(request("/cards", token))).status).toBe(307);
  });

  it("does not accept a Google session once Google is switched off", async () => {
    enableGoogle();
    const token = await signSession({ via: "google", email: OWNER }, SECRET);

    delete process.env.GOOGLE_CLIENT_ID;
    process.env.APP_PASSWORD = PASSWORD;
    expect((await proxy(request("/cards", token))).status).toBe(307);
  });

  it("does not accept a password session when only Google is configured", async () => {
    enableGoogle();
    const token = await signSession({ via: "password" }, SECRET);
    expect((await proxy(request("/cards", token))).status).toBe(307);
  });
});

describe("signing in with a password", () => {
  function attempt(body: unknown) {
    return login(
      new Request("https://cardpilot.test/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("issues a cookie the gate accepts", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const res = await attempt({ password: PASSWORD });
    expect(res.status).toBe(200);

    const cookie = res.cookies.get(AUTH_COOKIE)!;
    expect((await proxy(request("/settings", cookie.value))).status).toBe(200);
    expect(cookie.httpOnly).toBe(true);
  });

  it("rejects a wrong password without setting anything", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    const res = await attempt({ password: "hunter2" });

    expect(res.status).toBe(401);
    expect(res.cookies.get(AUTH_COOKIE)).toBeUndefined();
  });

  it("rejects an empty submission", async () => {
    process.env.APP_PASSWORD = PASSWORD;
    expect((await attempt({ password: "" })).status).toBe(400);
    expect((await attempt({})).status).toBe(400);
  });
});

describe("starting the Google handshake", () => {
  function startRequest(query = "") {
    return new NextRequest(new URL(`https://cardpilot.test/api/auth/google/start${query}`));
  }

  it("redirects to Google carrying state and a PKCE challenge", async () => {
    enableGoogle();
    const res = await start(startRequest());

    expect(res.status).toBe(307);
    const target = new URL(res.headers.get("location")!);
    expect(target.host).toBe("accounts.google.com");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");

    // The state sent to Google must be the state kept on this device.
    const state = res.cookies.get(STATE_COOKIE)!;
    expect(target.searchParams.get("state")).toBe(state.value);
    expect(state.httpOnly).toBe(true);

    const verifier = res.cookies.get(VERIFIER_COOKIE)!;
    expect(verifier.httpOnly).toBe(true);
    // The verifier itself must never travel to Google, only its digest.
    expect(target.search).not.toContain(verifier.value);
  });

  it("refuses to become an open redirect", async () => {
    enableGoogle();
    for (const hostile of ["https://attacker.test", "//attacker.test", "javascript:alert(1)"]) {
      const res = await start(startRequest(`?next=${encodeURIComponent(hostile)}`));
      expect(res.cookies.get(RETURN_COOKIE)!.value).toBe("/");
    }
  });

  it("remembers a same-site destination", async () => {
    enableGoogle();
    const res = await start(startRequest("?next=%2Fsettings"));
    expect(res.cookies.get(RETURN_COOKIE)!.value).toBe("/settings");
  });

  it("sends you back to the login screen when Google is not configured", async () => {
    const res = await start(startRequest());
    const target = new URL(res.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("error")).toBe("google_unconfigured");
  });
});

describe("the Google callback", () => {
  function callbackRequest(query: string, cookies: Record<string, string> = {}) {
    const req = new NextRequest(new URL(`https://cardpilot.test/api/auth/google/callback${query}`));
    for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
    return req;
  }

  async function reasonFor(req: NextRequest) {
    const res = await callback(req);
    return new URL(res.headers.get("location")!).searchParams.get("error");
  }

  it("refuses a callback it did not start", async () => {
    enableGoogle();
    // No state cookie at all.
    expect(await reasonFor(callbackRequest("?code=abc&state=xyz"))).toBe("state");
  });

  it("refuses a mismatched state, which is the CSRF case", async () => {
    enableGoogle();
    const req = callbackRequest("?code=abc&state=attacker-state", {
      [STATE_COOKIE]: "our-state",
      [VERIFIER_COOKIE]: "verifier",
    });
    expect(await reasonFor(req)).toBe("state");
  });

  it("refuses when the PKCE verifier is missing", async () => {
    enableGoogle();
    const req = callbackRequest("?code=abc&state=our-state", { [STATE_COOKIE]: "our-state" });
    expect(await reasonFor(req)).toBe("state");
  });

  it("reports a refusal at Google's end without attempting an exchange", async () => {
    enableGoogle();
    expect(await reasonFor(callbackRequest("?error=access_denied"))).toBe("denied");
  });

  it("does nothing when Google is not configured", async () => {
    expect(await reasonFor(callbackRequest("?code=abc&state=xyz"))).toBe("google_unconfigured");
  });

  it("never leaves this origin, whatever the return cookie says", async () => {
    enableGoogle();
    // Fails at the state check, but the redirect target is still built from the cookie.
    for (const hostile of ["//attacker.test", "https://attacker.test", "/\\attacker.test"]) {
      const res = await callback(callbackRequest("?code=abc&state=xyz", { [RETURN_COOKIE]: hostile }));
      expect(new URL(res.headers.get("location")!).origin).toBe("https://cardpilot.test");
    }
  });
});

describe("redirect targets", () => {
  it("keeps same-site paths and rejects everything else", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/cards?q=1")).toBe("/cards?q=1");

    for (const hostile of [
      "//attacker.test",
      "/\\attacker.test",
      "https://attacker.test",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(hostile), String(hostile)).toBe("/");
    }
  });
});

describe("the route matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("guards the pages and APIs that expose your data", () => {
    for (const path of ["/", "/cards", "/cards/add", "/settings", "/api/recommend", "/api/snapshot"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });

  it("leaves out what a locked browser still needs", () => {
    for (const path of [
      "/login",
      "/api/login",
      // The sign-in handshake has to work before there is a session.
      "/api/auth/google/start",
      "/api/auth/google/callback",
      "/sw.js",
      "/manifest.webmanifest",
      "/icons/card-stack.svg",
      "/icon.svg",
      "/apple-icon",
      "/_next/static/chunk.js",
    ]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });
});
