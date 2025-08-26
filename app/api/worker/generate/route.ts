// app/api/worker/generate/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import OpenAI from "openai";
import { put } from "@vercel/blob";
import { falGenerateImagen4Fast, falRemoveBackground } from "@/lib/providers/fal";

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
  transparent?: "1" | "0";
};

// Helper to read HTTP-ish status fields without using `any`
function getHttpStatus(e: unknown): number | undefined {
  if (typeof e === "object" && e !== null) {
    const o = e as { status?: number; statusCode?: number };
    return o.status ?? o.statusCode;
  }
  return undefined;
}

// Provider selection + generation helper (returns urls + provider used)
async function generateWithProvider(
  job: JobHash,
  n: number
): Promise<{ urls: string[]; provider: "openai" | "fal" }> {
  const primary = (process.env.IMAGE_PROVIDER_PRIMARY || "openai").toLowerCase();
  const overflow = (process.env.IMAGE_OVERFLOW_PROVIDER || "").toLowerCase();

  const runOpenAI = async (): Promise<string[]> => {
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: job.prompt,
      size: job.size,
      quality: job.quality,
      n,
    });

    const raw =
      result.data
        ?.map((d) => (d.url ? d.url : d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter((u): u is string => Boolean(u)) ?? [];

    if (raw.length === 0) throw Object.assign(new Error("No images returned"), { status: 502 });
    return raw;
  };

  const runFal = async (): Promise<string[]> => {
    const urls = await falGenerateImagen4Fast({
      prompt: job.prompt,
      numImages: n,
      aspectRatio: "1:1",
    });
    if (urls.length === 0) throw Object.assign(new Error("No images returned (fal)"), { status: 502 });
    return urls;
  };

  if (primary === "fal") {
    const urls = await runFal();
    return { urls, provider: "fal" };
  }

  try {
    const urls = await runOpenAI();
    return { urls, provider: "openai" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    const code = getHttpStatus(e);
    const isRetryable = code === 429 || (code != null && code >= 500) || /rate\s*limit/i.test(msg);
    if (overflow === "fal" && isRetryable) {
      const urls = await runFal();
      return { urls, provider: "fal" };
    }
    throw e;
  }
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

    // Provider-aware generation
    const { urls: raw, provider } = await generateWithProvider(job, n);

    // Instrumentation: record provider actually used
    await redis.hset(key, { provider });

    // Upload each image to Vercel Blob (originals first)
    const originalUrls: string[] = [];
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
      originalUrls.push(url);
    }

    // Optional background removal via fal BiRefNet (finals only)
    const wantTransparent = job.transparent === "1";
    const bgProvider = (process.env.IMAGE_BG_REMOVAL_PROVIDER || "").trim().toLowerCase();
    const useBgRemoval = wantTransparent && bgProvider === "fal-birefnet-v2";

    // Instrumentation: record decision & env the worker saw
    await redis.hset(key, { bg_removal: useBgRemoval ? "fal-birefnet-v2" : "skip", bg_env: bgProvider });

    const finalUrls: string[] = [];
    if (useBgRemoval) {
      for (let i = 0; i < originalUrls.length; i++) {
        try {
          // Call fal BiRefNet using the stored original
          const cutUrl = await falRemoveBackground(originalUrls[i]);
          const r = await fetch(cutUrl);
          const ab = await r.arrayBuffer();
          const bytes = Buffer.from(ab);
          const filename = `designs/${jobId}/${i}-cutout.png`;
          const { url } = await put(filename, bytes, {
            access: "public",
            contentType: "image/png",
            addRandomSuffix: true,
          });
          finalUrls.push(url);
        } catch (e) {
          console.warn("BiRefNet failed; using original", { jobId, i, e });
          finalUrls.push(originalUrls[i]);
        }
      }
    } else {
      finalUrls.push(...originalUrls);
    }

    await redis.hset(key, { status: "done", images: JSON.stringify(finalUrls), error: "" });
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