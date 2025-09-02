import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/ip";
import { checkBurstLimit } from "@/lib/rate-limit";

/**
 * Edge middleware: lightweight burst throttle for POST /api/generate
 * Does not touch any other routes.
 */
export async function middleware(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.next();

  const { pathname } = new URL(req.url);
  if (pathname !== "/api/generate") return NextResponse.next();

  // Allow disabling at runtime if needed
  if (process.env.RATELIMIT_ENABLED === "0") return NextResponse.next();

  const ip = getClientIp(req) || "unknown";
  const { allowed, retryAfter } = await checkBurstLimit(`gen:${ip}`);

  if (allowed) return NextResponse.next();

  const res = NextResponse.json(
    { error: "Too many requests—please try again in a few seconds." },
    { status: 429 }
  );
  if (retryAfter > 0) {
    res.headers.set("Retry-After", String(retryAfter));
  }
  return res;
}

export const config = {
  matcher: ["/api/generate"],
};