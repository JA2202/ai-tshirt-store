// app/api/jobs/[id]/route.ts
import { redis } from "@/lib/redis";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobOut = {
  status: "queued" | "working" | "done" | "failed";
  images?: string[];
  error?: string;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Next.js 14+ returns params as a Promise in route handlers
  const { id } = await context.params;

  const key = `jobs:${id}`;
  const job = await redis.hgetall<Record<string, unknown>>(key);
  if (!job) return new Response("Not found", { status: 404 });

  const out: JobOut = { status: String(job.status) as JobOut["status"] };

  // --- Robustly parse the "images" field from Redis ---
  if (out.status === "done" && job.images != null) {
    let imgs: string[] = [];

    // If Redis somehow returns it as an array already
    if (Array.isArray(job.images)) {
      imgs = job.images as string[];
    } else if (typeof job.images === "string") {
      try {
        // Usually it's a JSON string: '["url1","url2", ...]'
        const parsed = JSON.parse(job.images) as unknown;
        if (Array.isArray(parsed)) imgs = parsed as string[];
      } catch (e) {
        // Fallback: try to recover a comma-separated string
        imgs = job.images
          .trim()
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s) => s.replace(/^"+|"+$/g, "").trim())
          .filter(Boolean);
      }
    }

    out.images = imgs;
  }

  if (job.error) out.error = String(job.error);

  // No caching for polling
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}