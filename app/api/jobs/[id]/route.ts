// /app/api/jobs/[id]/route.ts
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
  const { id } = await context.params; // <- await params

  const key = `jobs:${id}`;
  const job = await redis.hgetall<Record<string, string>>(key);
  if (!job) return new Response("Not found", { status: 404 });

  const out: JobOut = { status: job.status as JobOut["status"] };
  if (job.images && job.status === "done") {
    try {
      out.images = JSON.parse(job.images) as string[];
    } catch {
      out.images = [];
    }
  }
  if (job.error) out.error = job.error;

  return Response.json(out);
}