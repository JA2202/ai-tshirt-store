// app/api/worker/generate/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Matches what you store in /api/generate
type JobStatus = "queued" | "working" | "done" | "failed";
type JobHash = {
  status: JobStatus;
  createdAt: string;      // stored as string in Redis hash
  prompt: string;
  count: string;          // Redis stores numbers as strings
  size: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "high";
  images?: string;
  error?: string;
};

export async function POST(req: Request) {
  try {
    const { jobId } = (await req.json()) as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const key = `jobs:${jobId}`;
    const job = await redis.hgetall<JobHash>(key);
    if (!job || !job.prompt) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Mark working
    await redis.hset(key, { status: "working" });

    const n = Math.min(8, Math.max(1, Number.parseInt(job.count || "1", 10) || 1));

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: job.prompt,
      size: job.size,            // already normalized by /api/generate
      quality: job.quality,      // "low" | "high"
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

    // Write result so the poller flips to "done"
    await redis.hset(key, {
      status: "done",
      images: JSON.stringify(images),
      error: "",
    });

    // QStash only needs a 200 OK
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    // We can’t know jobId on parse errors, so only write when we have it
    try {
      const { jobId } = (await req.json()) as { jobId?: string };
      if (jobId) {
        await redis.hset(`jobs:${jobId}`, { status: "failed", error: message });
      }
    } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}