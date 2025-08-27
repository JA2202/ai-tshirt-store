"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export default function GtmBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Skip if GTM isn't present
    if (typeof window === "undefined" || !window.dataLayer) return;

    const page_path = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
    window.dataLayer.push({
      event: "page_view",
      page_path,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}