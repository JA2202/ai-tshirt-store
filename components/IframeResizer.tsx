"use client";

import { useEffect } from "react";

export default function IframeResizer() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Add a CSS hook when embedded (?embed=1)
    const params = new URLSearchParams(window.location.search);
    const isEmbedded = params.get("embed") === "1";
    if (isEmbedded) {
      document.documentElement.classList.add("embed");
    }

    // Post height to parent for iframe auto-resize
    const postHeight = () => {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
        document.documentElement.offsetHeight,
        document.body?.offsetHeight ?? 0
      );
      window.parent?.postMessage({ type: "tstore:height", height: h }, "*");
    };

    let timer: number | undefined;
    const onResize = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(postHeight, 100);
    };

    // initial + events
    postHeight();
    window.addEventListener("load", postHeight);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("load", postHeight);
      window.removeEventListener("resize", onResize);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}