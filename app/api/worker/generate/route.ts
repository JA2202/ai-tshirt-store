// app/api/worker/generate/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import OpenAI from "openai";
import { put } from "@vercel/blob";
import { falGenerateImagen4Fast, falRemoveBackground, falGeminiEdit } from "@/lib/providers/fal";

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
  transparent?: "1" | "0" | "true" | "false";
  ref_url?: string;
};

// ---------- helpers ----------
function getHttpStatus(e: unknown): number | undefined {
  if (typeof e === "object" && e !== null) {
    const o = e as { status?: number; statusCode?: number };
    return o.status ?? o.statusCode;
  }
  return undefined;
}
function truthy(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

// Returns urls + which provider actually ran
async function generateWithProvider(
  job: JobHash,
  n: number
): Promise<{ urls: string[]; provider: "openai" | "fal" | "fal_gemini_edit" }> {
  const primary = (process.env.IMAGE_PROVIDER_PRIMARY || "openai").toLowerCase();
  const overflow = (process.env.IMAGE_OVERFLOW_PROVIDER || "").toLowerCase();

  // If a reference image is present, ALWAYS use Gemini Edit
  if (job.ref_url) {
    const urls = await falGeminiEdit({
      imageUrl: job.ref_url,
      prompt: job.prompt,
      numImages: n,
      aspectRatio: "1:1",
      // imageStrength: 0.7, // optional tuning later
    });
    return { urls, provider: "fal_gemini_edit" };
  }

  const runOpenAI = async (): Promise<string[]> => {
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: job.prompt,
      size: job.size,
      quality: job.quality,
      n,
      // background: truthy(job.transparent) ? "transparent" : undefined, // optional later
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

    // Generate
    const { urls: raw, provider } = await generateWithProvider(job, n);
    await redis.hset(key, { provider }); // instrumentation

    // Upload originals to Blob
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

      // ---- NEW: track the blob for retention cleanup
      const path = new URL(url).pathname.slice(1);
      await redis.zadd("blobs:generated", { score: Date.now(), member: path });
    }

    // Decide BG removal
    const wantFromJob = truthy(job.transparent);
    const wantFromEnv = truthy(process.env.IMAGE_ENABLE_BG_REMOVAL_FINALS);
    const wantTransparent = wantFromJob || wantFromEnv;

    const bgProviderEnv = (process.env.IMAGE_BG_REMOVAL_PROVIDER || "").trim().toLowerCase();
    const useBgRemoval =
      wantTransparent && provider.startsWith("fal") && bgProviderEnv === "fal-birefnet-v2";

    // Instrumentation to see exactly what the worker saw/decided
    await redis.hset(key, {
      bg_env: bgProviderEnv,
      bg_want_job: wantFromJob ? "1" : "0",
      bg_want_env: wantFromEnv ? "1" : "0",
      bg_removal: useBgRemoval ? "fal-birefnet-v2" : "skip",
    });

    // Optionally run BiRefNet
    const finalUrls: string[] = [];
    if (useBgRemoval) {
      for (let i = 0; i < originalUrls.length; i++) {
        try {
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

          // ---- NEW: track the cutout blob as well
          const path = new URL(url).pathname.slice(1);
          await redis.zadd("blobs:generated", { score: Date.now(), member: path });
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
      console.warn("worker rate limited — QStash will retry", { jobId, message });
      return NextResponse.json({ retry: true, error: message }, { status: 429 });
    }
    console.error("worker error", { jobId, message });
    await redis.hset(key, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}