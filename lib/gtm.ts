// lib/gtm.ts
export type GTMPayload = string | Record<string, unknown>;
type DataLayer = GTMPayload[];

declare global {
  interface Window {
    // Keep this OPTIONAL so pages can render before GTM loads
    dataLayer?: DataLayer;
  }
}

export function gtmPush(payload: GTMPayload): void {
  if (typeof window === "undefined") return;

  if (!Array.isArray(window.dataLayer)) {
    window.dataLayer = [];
  }

  window.dataLayer.push(payload);
}