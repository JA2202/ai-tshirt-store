import { redis } from "@/lib/redis";

/**
 * Simple fixed-window burst limiter: LIMIT requests per WINDOW_SEC seconds.
 * Keys are time-bucketed so expire automatically.
 */
const LIMIT = Number(process.env.RATE_LIMIT_BURST ?? 8);
const WINDOW_SEC = Number(process.env.RATE_LIMIT_WINDOW_SEC ?? 20);

function bucketNow(): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / WINDOW_SEC);
}

export async function checkBurstLimit(baseKey: string): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const bucket = bucketNow();
    const key = `rl:burst:${baseKey}:${bucket}`;

    // INCR & set expiry (idempotent if set already)
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SEC);
    }

    if (count <= LIMIT) {
      return { allowed: true, retryAfter: 0 };
    }

    // Compute remaining seconds in the current bucket for Retry-After
    const ttl = await redis.ttl(key);
    const retryAfter = ttl > 0 ? ttl : WINDOW_SEC;
    return { allowed: false, retryAfter };
  } catch {
    // On redis errors, fail open so site remains functional
    return { allowed: true, retryAfter: 0 };
  }
}