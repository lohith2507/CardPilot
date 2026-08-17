import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST so a prefetch or an image tag cannot sign you out. */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
