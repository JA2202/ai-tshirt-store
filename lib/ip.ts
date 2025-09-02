import type { NextRequest } from "next/server";

/** Safely extract a best-effort client IP for rate-limits. */
export function getClientIp(req: Request | NextRequest): string | null {
  const hdr = (name: string) =>
    (req.headers.get(name) || "").trim();

  const xff = hdr("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = hdr("cf-connecting-ip");
  if (cf) return cf;

  const real = hdr("x-real-ip");
  if (real) return real;

  // Bun/edge runtime sometimes exposes via req.ip / not standard in Next
  return null;
}