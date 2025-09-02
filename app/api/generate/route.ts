// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { qstash, WORKER_URL } from "@/lib/qstash";
import { put } from "@vercel/blob";
import { ensureTrustCookie } from "@/lib/trust-cookie"; // <-- ADDED

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

// ---------- Human gate (Turnstile) & Rate-limit config ----------
const HUMAN_GATE_ENABLED = process.env.HUMAN_GATE_ENABLED === "1";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || "";

const RL_WINDOW_SEC = Number(process.env.RL_WINDOW_SEC ?? 30); // sliding window
const RL_MAX = Number(process.env.RL_MAX ?? 3); // max requests per IP per window
const DAILY_GEN_CAP = Number(process.env.DAILY_GEN_CAP ?? 5); // max jobs per user per day

// ---------- Types ----------
type GenerateBody = {
  prompt: string;
  count?: number;
  size?: ImgSize | string;
  quality?: ImgQuality | string;
  transparent_background?: boolean; // request transparent background via worker (BiRefNet)
  ref_data_url?: string | null; // reference image (data URL)
  turnstile_token?: string; // optional: turnstile token in body
};

type JobStatus = "queued" | "working" | "done" | "failed";

type JobRecord = {
  status: JobStatus;
  createdAt: number;
  prompt: string;
  count: number;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "high";
  images?: string;
  error?: string;
  transparent?: "1" | "0";
  ref_url?: string;

  // ---- DEBUG-only fields (for visibility in Redis) ----
  human_gate?: "ok" | "skipped";
  trust_id?: string;
  ts_ip?: string;
  ts_token_hint?: string;
};

type TurnstileVerify = {
  success: boolean;
  /** See https://developers.cloudflare.com/turnstile/reference/error-codes/ */
  "error-codes"?: string[];
  action?: string;
  cdata?: string;
};

// ---------- Helpers ----------
function getClientIp(req: NextRequest): string {
  // Prefer Cloudflare / proxy headers if present
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "0.0.0.0";
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;
  // Fallback (not always available in serverless)
  return "0.0.0.0";
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilEndOfUTCDay(now = new Date()): number {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
}

function isTurnstileVerify(v: unknown): v is TurnstileVerify {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).success === "boolean";
}

async function verifyTurnstile(token: string, ip: string): Promise<{ ok: boolean; reason?: string }> {
  if (!TURNSTILE_SECRET) return { ok: false, reason: "TURNSTILE_SECRET not set" };

  const body = new URLSearchParams();
  body.set("secret", TURNSTILE_SECRET);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: unknown = await resp.json();
    if (!isTurnstileVerify(json)) return { ok: false, reason: "Bad verify response" };
    if (!json.success) {
      const codes = (json["error-codes"] || []).join(", ");
      return { ok: false, reason: codes || "verification_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "verify_failed" };
  }
}

export async function POST(req: NextRequest) {
  try {
    // --- Maintenance kill-switch ---
    if (process.env.GENERATION_DISABLED === "1") {
      return NextResponse.json(
        { error: "Maintenance in progress. Please try again soon." },
        { status: 503 }
      );
    }

    // Ensure infra keys exist (also needed for rate-limit storage)
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

    // Parse request body once
    const body = (await req.json()) as GenerateBody;

    // --- Basic validation (kept from your previous route) ---
    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Identify caller for rate-limits (trust cookie if present; fallback to IP)
    const ip = getClientIp(req);
    const trustId = await ensureTrustCookie(); // <-- CHANGED (added await + helper)
    const userKey = trustId || ip || "anon";

    // ---- DEBUG vars for Redis visibility ----
    let humanGateState: "ok" | "skipped" = "skipped";
    let tokenHint: string | undefined;

    // --- Human gate (low-friction Turnstile) ---
    if (HUMAN_GATE_ENABLED) {
      const token =
        body?.turnstile_token ||
        req.headers.get("x-turnstile-token") ||
        req.headers.get("cf-turnstile-response") ||
        "";

      if (!token) {
        return NextResponse.json(
          { error: "Human verification required. Please refresh and try again." },
          { status: 400 }
        );
      }

      const result = await verifyTurnstile(token, ip);
      if (!result.ok) {
        return NextResponse.json(
          { error: "Verification failed. Please try again.", reason: result.reason },
          { status: 400 }
        );
      }

      // record a short non-sensitive hint (first 10 chars + length)
      tokenHint = `${token.slice(0, 10)}…(${token.length})`;
      humanGateState = "ok";
    }

    // --- Sliding window IP rate-limit (cheap path) ---
    const rlKey = `rl:gen:ip:${ip}`;
    const ipHits = await redis.incr(rlKey);
    if (ipHits === 1) {
      // set window only on first hit to keep it sliding
      await redis.expire(rlKey, RL_WINDOW_SEC);
    }
    if (ipHits > RL_MAX) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down and try again shortly." },
        { status: 429 }
      );
    }

    // --- Daily cap per user ---
    const today = isoDateUTC(new Date());
    const dayKey = `rl:gen:day:${userKey}:${today}`;
    const usedToday = await redis.incr(dayKey);
    if (usedToday === 1) {
      await redis.expire(dayKey, secondsUntilEndOfUTCDay());
    }
    if (usedToday > DAILY_GEN_CAP) {
      return NextResponse.json(
        { error: `Daily limit reached. You can generate again tomorrow.` },
        { status: 429 }
      );
    }

    // Clamp variants (fixed 3 as per your current implementation)
    const count = 3;

    // Size normalization (treat "auto" as 1024x1024 like before)
    const reqSize = (body?.size ?? "1024x1024") as string;
    const sizeAllowed = ALLOWED_SIZES.includes(reqSize as ImgSize)
      ? (reqSize as ImgSize)
      : "1024x1024";
    const normalizedSize: "1024x1024" | "1024x1536" | "1536x1024" =
      sizeAllowed === "auto" ? "1024x1024" : (sizeAllowed as Exclude<ImgSize, "auto">);

    // Quality normalization:
    // UI accepts low / medium / high but OpenAI effectively has 2 tiers.
    // Map: high -> "high", everything else -> "low".
    const reqQuality = (body?.quality ?? "low") as string;
    const qualityAllowed = ALLOWED_QUALITIES.includes(reqQuality as ImgQuality)
      ? (reqQuality as ImgQuality)
      : "low";
    const normalizedQuality: "low" | "high" =
      qualityAllowed === "high" ? "high" : "low";

    // NEW: normalize transparent background flag
    const transparentFlag = body?.transparent_background === true ? "1" : "0";

    // --- Create and persist the job ---
    const jobId = randomUUID();
    const key = `jobs:${jobId}`;

    // OPTIONAL: upload reference image (if provided as data URL) and capture its public URL
    let refUrl: string | undefined;
    const refData = body?.ref_data_url;
    if (typeof refData === "string" && refData.startsWith("data:image")) {
      const [meta, b64] = refData.split(",", 2);
      const mime =
        /data:(image\/[a-zA-Z0-9.+-]+);base64/.exec(meta)?.[1] || "image/png";
      const ext =
        mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      const bytes = Buffer.from(b64 || "", "base64");
      const { url } = await put(`refs/${jobId}.${ext}`, bytes, {
        access: "public",
        contentType: mime,
        addRandomSuffix: true,
      });
      refUrl = url;
    }

    const job: JobRecord = {
      status: "queued",
      createdAt: Date.now(),
      prompt,
      count,
      size: normalizedSize,
      quality: normalizedQuality,
      transparent: transparentFlag,
      ...(refUrl ? { ref_url: refUrl } : {}),

      // --- DEBUG fields you can see in Upstash ---
      human_gate: HUMAN_GATE_ENABLED ? humanGateState : "skipped",
      trust_id: trustId || undefined,
      ts_ip: ip,
      ts_token_hint: tokenHint,
    };

    await redis.hset(key, job as unknown as Record<string, string | number>);
    await redis.expire(key, 60 * 60 * 24); // 24h TTL

    // --- Enqueue for the worker via a QStash Queue (smooth bursts) ---
    await qstash.publishJSON({
      url: WORKER_URL,
      body: { jobId },
      queue: "image-gen",
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