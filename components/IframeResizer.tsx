"use client";

import { useEffect } from "react";

export default function IframeResizer() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const post = () => {
      // Send height to parent (your host site should listen for this)
      try {
        const h = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        );
        window.parent?.postMessage({ type: "ai-tee-resize", height: h }, "*");
      } catch {}
    };

    // Initial + on resize/route/content changes
    const ro = new ResizeObserver(() => post());
    ro.observe(document.documentElement);

    post();
    const onLoad = () => post();
    window.addEventListener("load", onLoad);

    return () => {
      ro.disconnect();
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}