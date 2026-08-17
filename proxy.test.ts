import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { AUTH_COOKIE, readSession, safeEqual, signSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/utils";

const SECRET = "0123456789abcdef0123456789abcdef";
const OWNER = "owner@example.com";

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(new URL(`https://cardpilot.test${path}`));
  if (cookie) req.cookies.set(AUTH_COOKIE, cookie);
  return req;
}

function session(overrides: Partial<Parameters<typeof signSession>[0]> = {}) {
  return signSession(
    {
      via: "password",
      userId: 1,
      email: OWNER,
      isAdmin: false,
      mustChangePassword: false,
      ...overrides,
    },
    SECRET,
  );
}

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_ALLOWED_EMAILS;
});

describe("session tokens", () => {
  it("round-trips what was put in", async () => {
    const token = await session({ via: "google", isAdmin: true });
    const parsed = await readSession(token, SECRET);

    expect(parsed).toMatchObject({
      via: "google",
      email: OWNER,
      userId: 1,
      isAdmin: true,
      mustChangePassword: false,
    });
    expect(parsed?.iat).toBeTypeOf("number");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await session();
    expect(await readSession(token, `${SECRET}x`)).toBeNull();
  });

  it("rejects a payload edited after signing", async () => {
    const token = await session({ via: "google" });
    const forged = await session({ via: "google", email: "attacker@example.com", userId: 99 });
    const spliced = `${forged.split(".")[0]}.${token.split(".")[1]}`;
    expect(await readSession(spliced, SECRET)).toBeNull();
  });

  it("rejects malformed tokens and sessions without userId", async () => {
    for (const value of ["", "nonsense", "no-dot-separator", ".", "a.b.c"]) {
      expect(await readSession(value, SECRET)).toBeNull();
    }
    expect(await readSession(undefined, SECRET)).toBeNull();
  });

  it("compares without leaking length mismatches as equality", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("the gate", () => {
  it("lets everything through when AUTH_SECRET is unset", async () => {
    const res = await proxy(request("/cards"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a locked browser to the login screen", async () => {
    process.env.AUTH_SECRET = SECRET;
    const res = await proxy(request("/settings"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/settings");
  });

  it("answers API calls with 401 rather than an HTML redirect", async () => {
    process.env.AUTH_SECRET = SECRET;
    const res = await proxy(request("/api/recommend"));
    expect(res.status).toBe(401);
  });

  it("admits a signed-in user", async () => {
    process.env.AUTH_SECRET = SECRET;
    expect((await proxy(request("/cards", await session()))).status).toBe(200);
  });

  it("rejects a cookie signed with a different secret", async () => {
    process.env.AUTH_SECRET = SECRET;
    const token = await session();
    process.env.AUTH_SECRET = "different-secret-0123456789abcdef12";
    expect((await proxy(request("/cards", token))).status).toBe(307);
  });

  it("forces a password change before the rest of the app", async () => {
    process.env.AUTH_SECRET = SECRET;
    const token = await session({ mustChangePassword: true });
    const res = await proxy(request("/cards", token));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/change-password");
  });

  it("allows the password API while a change is required", async () => {
    process.env.AUTH_SECRET = SECRET;
    const token = await session({ mustChangePassword: true });
    expect((await proxy(request("/api/auth/password", token))).status).toBe(200);
  });
});

describe("matcher", () => {
  it("leaves login and change-password outside the gate", () => {
    expect(config.matcher[0]).toContain("login");
    expect(config.matcher[0]).toContain("change-password");
  });
});

describe("safeNextPath", () => {
  it("only allows same-origin relative paths", () => {
    expect(safeNextPath("/cards")).toBe("/cards");
    expect(safeNextPath("https://evil.test")).toBe("/");
  });
});
