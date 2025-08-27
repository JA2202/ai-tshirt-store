// /lib/gtm.ts
export type DataLayerPayload = Record<string, unknown>;

export function gtmPush(event: string, payload: DataLayerPayload = {}) {
  if (typeof window === "undefined") return;
  (window as unknown as { dataLayer: unknown[] }).dataLayer =
    (window as unknown as { dataLayer: unknown[] }).dataLayer || [];
  (window as unknown as { dataLayer: unknown[] }).dataLayer.push({ event, ...payload });
}