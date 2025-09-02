// lib/trust-cookie.ts
import 'server-only';
import { cookies } from 'next/headers';

// New: dedicated identity cookie (UUID)
const ID_COOKIE = 'tl_tid';

// Legacy cookie that used to carry either a UUID or the flag "1"
const LEGACY_FLAG_COOKIE = 'tl_trust';

// 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30;

// UUID matcher (relaxed, lowercase/uppercase)
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/**
 * Read the persistent identity (UUID) for this browser.
 * - Primary source: tl_tid (UUID)
 * - Migration: if missing, try tl_trust and extract a UUID if present
 *   (ignore the common "1" flag value).
 */
export async function readTrustCookie(): Promise<string | null> {
  const store = await cookies(); // your setup treats cookies() as async

  // Preferred ID cookie
  const id = store.get(ID_COOKIE)?.value ?? null;
  if (id) return id;

  // Migration path: extract UUID from legacy tl_trust if present
  const legacy = store.get(LEGACY_FLAG_COOKIE)?.value ?? null;
  if (!legacy || legacy === '1') return null;

  const m = legacy.match(UUID_RE);
  if (!m) return null;

  const uuid = m[0];

  // Persist it into the new dedicated ID cookie
  try {
    store.set(ID_COOKIE, uuid, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: DEFAULT_MAX_AGE,
    });
  } catch {
    // non-fatal in edge runtimes without mutation support
  }
  return uuid;
}

/**
 * Write/refresh the identity UUID cookie.
 * (Name kept for backward compatibility with your imports.)
 */
export async function writeTrustCookie(
  value: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE
): Promise<void> {
  const store = await cookies();
  store.set(ID_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/**
 * Ensure an identity exists and return it.
 * Generates a new UUID when none is present.
 */
export async function ensureTrustCookie(): Promise<string> {
  // If a bogus "1" ever slipped into tl_tid, treat it as missing.
  const existing = await readTrustCookie();
  if (existing && existing !== '1') return existing;

  const fresh = crypto.randomUUID();
  await writeTrustCookie(fresh);
  return fresh;
}