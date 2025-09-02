// lib/trust-cookie.ts
import 'server-only';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'tl_trust';
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Read the trust cookie (or null if missing). */
export async function readTrustCookie(): Promise<string | null> {
  const store = await cookies(); // NOTE: cookies() is async in your setup
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** Write/refresh the trust cookie. */
export async function writeTrustCookie(
  value: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE
): Promise<void> {
  const store = await cookies(); // await!
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/** Ensure a trust cookie exists and return its value. */
export async function ensureTrustCookie(): Promise<string> {
  const existing = await readTrustCookie();
  if (existing) return existing;

  const fresh = crypto.randomUUID();
  await writeTrustCookie(fresh);
  return fresh;
}