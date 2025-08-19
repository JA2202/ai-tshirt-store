// app/api/worker/generate/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type JobStatus = "queued" | "working" | "done" | "failed";
type JobHash = {
  status: JobStatus;
  createdAt: string;
  prompt: string;
  count: string;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "high";
  images?: string;
  error?: string;
};

export async function POST(req: Request) {
  // Parse once so we can reuse jobId in the catch block
  const body = (await req.json().catch(() => null)) as { jobId?: string } | null;
  const jobId = body?.jobId;
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const key = `jobs:${jobId}`;

  try {
    const job = await redis.hgetall<JobHash>(key);
    if (!job?.prompt) {
      await redis.hset(key, { status: "failed", error: "Job not found" });
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    await redis.hset(key, { status: "working" });

    const n = Math.min(8, Math.max(1, parseInt(job.count || "1", 10) || 1));
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: job.prompt,
      size: job.size,
      quality: job.quality, // "low" | "high"
      n,
    });

    const images =
      result.data
        ?.map((d) => (d.url ? d.url : d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter((u): u is string => Boolean(u)) ?? [];

    if (images.length === 0) {
      await redis.hset(key, { status: "failed", error: "No images returned" });
      return NextResponse.json({ error: "No images returned" }, { status: 502 });
    }

    await redis.hset(key, { status: "done", images: JSON.stringify(images), error: "" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("worker error", { jobId, message });
    await redis.hset(key, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}