"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Size = "invisible" | "compact" | "normal" | "flexible";
type Theme = "auto" | "light" | "dark";

type RenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  size?: Size;
  theme?: Theme;
  action?: string;
  cData?: string;
};

type TurnstileAPI = {
  render: (container: HTMLElement, opts: RenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
  execute: (widgetId?: string) => void;
};

declare global {
  // eslint-disable-next-line no-var
  var turnstile: TurnstileAPI | undefined;
}

export type TurnstileHandle = {
  execute: () => void;
  reset: () => void;
};

export default forwardRef<TurnstileHandle, { action?: string; onVerify?: (token: string) => void }>(
  function Turnstile({ action = "generate", onVerify }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      execute: () => {
        if (widgetIdRef.current && globalThis.turnstile) {
          globalThis.turnstile.execute(widgetIdRef.current);
        }
      },
      reset: () => {
        if (widgetIdRef.current && globalThis.turnstile) {
          globalThis.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      let cancelled = false;
      const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

      function init() {
        if (cancelled) return;
        if (!containerRef.current) {
          setTimeout(init, 100);
          return;
        }
        const ts = globalThis.turnstile;
        if (!ts) {
          setTimeout(init, 100);
          return;
        }
        if (widgetIdRef.current) return; // already rendered
        const id = ts.render(containerRef.current, {
          sitekey,
          size: "invisible",
          action,
          callback: (token: string) => onVerify?.(token),
          "expired-callback": () => {
            // expired: require a fresh execute next time
          },
        });
        widgetIdRef.current = id;
      }

      init();
      return () => {
        cancelled = true;
        if (widgetIdRef.current && globalThis.turnstile) {
          globalThis.turnstile.remove(widgetIdRef.current);
        }
      };
    }, [action, onVerify]);

    return <div ref={containerRef} style={{ width: 0, height: 0, overflow: "hidden" }} />;
  }
);