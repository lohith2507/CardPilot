import { NextResponse } from "next/server";
import { z } from "zod";
import { authRequired, authSecret, sessionCookie, signSession } from "@/lib/auth";
import { normalizeEmail, verifyPassword } from "@/lib/password";
import { findUserByEmail, sessionFromUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  if (!authRequired()) {
    return NextResponse.json(
      { error: "Sign-in is off. Set AUTH_SECRET to enable accounts." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const user = await findUserByEmail(normalizeEmail(parsed.data.email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Email or password is wrong." }, { status: 401 });
  }

  const secret = authSecret();
  if (!secret) {
    return NextResponse.json({ error: "Sessions cannot be signed. Set AUTH_SECRET." }, { status: 500 });
  }

  const response = NextResponse.json({
    ok: true,
    mustChangePassword: user.mustChangePassword,
  });
  response.cookies.set(
    sessionCookie(await signSession(sessionFromUser(user, "password"), secret)),
  );
  return response;
}
