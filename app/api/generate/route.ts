// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { qstash, WORKER_URL } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Strict literal unions (keep same as before so callers don't break)
type ImgSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
type ImgQuality = "low" | "medium" | "high";

const ALLOWED_SIZES: readonly ImgSize[] = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "auto",
];
const ALLOWED_QUALITIES: readonly ImgQuality[] = ["low", "medium", "high"];

type GenerateBody = {
  prompt: string;
  count?: number;
  size?: ImgSize | string;
  quality?: ImgQuality | string;
};

type JobStatus = "queued" | "working" | "done" | "failed";

type JobRecord = {
  status: JobStatus;
  createdAt: number;
  prompt: string;
  count: number;
  size: "1024x1024" | "1024x1536" | "1536x1024"; // worker needs concrete values
  // We map qualities down to the two OpenAI tiers the worker uses
  quality: "low" | "high";
  // Filled by worker later:
  images?: string; // JSON.stringified string[]
  error?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateBody;

    // --- Basic validation (kept from your previous route) ---
    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Clamp variants
    //const countRaw = Number(body?.count ?? 6);
    //const count = Math.min(8, Math.max(1, Number.isFinite(countRaw) ? countRaw : 6));
    const count =3;
    
    // Size normalization (treat "auto" as 1024x1024 like before)
    const reqSize = (body?.size ?? "1024x1024") as string;
    const sizeAllowed = ALLOWED_SIZES.includes(reqSize as ImgSize)
      ? (reqSize as ImgSize)
      : "1024x1024";
    const normalizedSize: "1024x1024" | "1024x1536" | "1536x1024" =
      sizeAllowed === "auto" ? "1024x1024"
      : (sizeAllowed as Exclude<ImgSize, "auto">);

    // Quality normalization:
    // your UI accepts low / medium / high but OpenAI effectively has 2 tiers.
    // Map: high -> "high", everything else -> "low".
    const reqQuality = (body?.quality ?? "low") as string;
    const qualityAllowed = ALLOWED_QUALITIES.includes(reqQuality as ImgQuality)
      ? (reqQuality as ImgQuality)
      : "low";
    const normalizedQuality: "low" | "high" =
      qualityAllowed === "high" ? "high" : "low";

    // Ensure infra keys exist (worker needs these)
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return NextResponse.json(
        { error: "Redis is not configured on the server" },
        { status: 500 }
      );
    }
    if (!process.env.QSTASH_TOKEN) {
      return NextResponse.json(
        { error: "QStash is not configured on the server" },
        { status: 500 }
      );
    }

    // --- Create and persist the job ---
    const jobId = randomUUID();
    const key = `jobs:${jobId}`;

    const job: JobRecord = {
      status: "queued",
      createdAt: Date.now(),
      prompt,
      count,
      size: normalizedSize,
      quality: normalizedQuality,
    };

    await redis.hset(key, job as unknown as Record<string, string | number>);
    await redis.expire(key, 60 * 60 * 24); // 24h TTL

    // --- Enqueue for the worker via a QStash Queue (smooth bursts) ---
    await qstash.publishJSON({
      url: WORKER_URL,
      body: { jobId },
      queue: "image-gen", // <-- publish through your queue (Parallelism 1–2)
    });

    // 202 Accepted: client should poll /api/jobs/:id
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Failed to enqueue generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}