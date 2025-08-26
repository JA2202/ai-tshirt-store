// app/api/worker/cleanup/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { del } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runCleanup(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const retentionDays =
    Math.max(0, parseInt(process.env.RETENTION_DAYS || "", 10)) || 30;
  const batchSize = parseInt(process.env.CLEANUP_BATCH_SIZE || "", 10) || 500;

  const cutoff = Date.now() - retentionDays * ONE_DAY_MS;

  // ✅ Upstash zrange with byScore + offset/count (no "limit" field)
  const candidates = (await redis.zrange(
    "blobs:generated",
    "-inf",
    cutoff,
    {
      byScore: true,
      offset: 0,
      count: batchSize,
    }
  )) as string[];

  let scanned = 0;
  let deleted = 0;
  let kept = 0;

  for (const path of candidates) {
    scanned += 1;

    const isProtected = Boolean(await redis.sismember("blobs:protected", path));
    if (isProtected) {
      kept += 1;
      continue;
    }

    if (!dryRun) {
      try {
        await del(path);                      // delete from Vercel Blob
        await redis.zrem("blobs:generated", path); // remove from index
        deleted += 1;
      } catch {
        kept += 1; // leave in index to retry next run
      }
    } else {
      kept += 1; // dry run
    }
  }

  return { scanned, deleted, kept, retentionDays, batchSize, dryRun };
}

export async function GET(req: Request) {
  return NextResponse.json(await runCleanup(req));
}
export async function POST(req: Request) {
  return NextResponse.json(await runCleanup(req));
}