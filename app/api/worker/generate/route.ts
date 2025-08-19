// app/api/worker/generate/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import OpenAI from "openai";
import { put } from "@vercel/blob";

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

// Helper to read HTTP-ish status fields without using `any`
function getHttpStatus(e: unknown): number | undefined {
  if (typeof e === "object" && e !== null) {
    const o = e as { status?: number; statusCode?: number };
    return o.status ?? o.statusCode;
  }
  return undefined;
}

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

    // Collect raw outputs (URLs or base64 data URLs)
    const raw =
      result.data
        ?.map((d) => (d.url ? d.url : d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter((u): u is string => Boolean(u)) ?? [];

    if (raw.length === 0) {
      await redis.hset(key, { status: "failed", error: "No images returned" });
      return NextResponse.json({ error: "No images returned" }, { status: 502 });
    }

    // Upload each image to Vercel Blob -> store tiny public URLs in Redis
    const urls: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const src = raw[i];
      let bytes: Buffer;

      if (src.startsWith("data:image")) {
        const b64 = src.split(",", 2)[1] || "";
        bytes = Buffer.from(b64, "base64");
      } else {
        const r = await fetch(src);
        const ab = await r.arrayBuffer();
        bytes = Buffer.from(ab);
      }

      const filename = `designs/${jobId}/${i}.png`;
      const { url } = await put(filename, bytes, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: true,
      });
      urls.push(url);
    }

    await redis.hset(key, { status: "done", images: JSON.stringify(urls), error: "" });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = getHttpStatus(err);
    const is429 = status === 429 || /rate\s*limit|exceeded the rate limit/i.test(message);

    if (is429) {
      // IMPORTANT: don’t mark failed; let QStash retry on 429.
      console.warn("worker rate limited — QStash will retry", { jobId, message });
      return NextResponse.json({ retry: true, error: message }, { status: 429 });
    }

    console.error("worker error", { jobId, message });
    await redis.hset(key, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}