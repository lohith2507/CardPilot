import { NextResponse } from "next/server";
import { z } from "zod";
import { appPassword, authSecret, safeEqual, sessionCookie, signSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const password = appPassword();
  if (!password) {
    return NextResponse.json({ error: "No password is configured." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  }

  if (!safeEqual(parsed.data.password, password)) {
    return NextResponse.json({ error: "That password is wrong." }, { status: 401 });
  }

  const secret = authSecret();
  if (!secret) {
    return NextResponse.json({ error: "Sessions cannot be signed. Set AUTH_SECRET." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(await signSession({ via: "password" }, secret)));
  return response;
}
