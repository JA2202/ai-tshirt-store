// /app/api/jobs/[id]/route.ts
import { redis } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobOut = {
  status: "queued" | "working" | "done" | "failed";
  images?: string[];
  error?: string;
};

// Be lenient with whatever ended up in Redis so the UI always gets an array.
function coerceImages(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];

  // Happy path: valid JSON array string
  try {
    if (s.startsWith("[")) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === "string");
      }
    }
    // A single JSON string (rare)
    if (s.startsWith('"') && s.endsWith('"')) {
      return [JSON.parse(s)];
    }
  } catch {
    /* fall through to other coercions */
  }

  // Single-quoted JSON (legacy/hand-written)
  try {
    if (s.includes("'")) {
      const arr = JSON.parse(s.replace(/'/g, '"'));
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === "string");
      }
    }
  } catch {
    /* ignore */
  }

  // CSV or just one URL
  if (s.includes(",")) {
    return s.split(/\s*,\s*/).filter(Boolean);
  }
  return [s];
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const key = `jobs:${id}`;
  const job = await redis.hgetall<Record<string, string>>(key);
  if (!job || !job.status) {
    return new Response("Not found", { status: 404 });
  }

  const out: JobOut = { status: job.status as JobOut["status"] };

  if (job.status === "done") {
    out.images = coerceImages(job.images);
  }
  if (job.error) out.error = job.error;

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store" },
  });
}