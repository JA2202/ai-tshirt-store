"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { GTMPayload } from "@/lib/gtm";

// Make this declaration IDENTICAL to lib/gtm.ts
declare global {
  interface Window {
    dataLayer?: GTMPayload[];
  }
}

export default function GtmBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined" || !Array.isArray(window.dataLayer)) return;

    const page_path = `${pathname}${
      searchParams?.toString() ? `?${searchParams.toString()}` : ""
    }`;

    window.dataLayer.push({
      event: "page_view",
      page_path,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}