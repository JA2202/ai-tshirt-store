export type GTMPayload = string | Record<string, unknown>;

export function gtmPush(payload: GTMPayload): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  // allow any payload shape GA4/Tags expect
  (w.dataLayer as unknown[]).push(payload as any);
}