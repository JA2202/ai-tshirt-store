type VerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

/**
 * Server-side verification for Cloudflare Turnstile.
 */
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // If not configured, treat as pass-through (to avoid hard-locking prod)
    return { ok: true };
  }

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteIp) form.append("remoteip", remoteIp);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });

  const data = (await res.json()) as VerifyResponse;
  if (data.success) return { ok: true };
  return { ok: false, reason: (data["error-codes"] || []).join(", ") || "verification_failed" };
}