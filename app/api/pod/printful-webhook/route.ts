// app/api/pod/printful-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  console.log("Printful webhook:", body);
  // TODO: verify signature if/when you configure one; update Blob order status
  return NextResponse.json({ ok: true });
}