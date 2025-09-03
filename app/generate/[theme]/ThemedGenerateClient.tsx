"use client";

import { useRef, useState, useEffect, createElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignStore } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gtmPush } from "@/lib/gtm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ThemeConfig, ThemeKey } from "../themes";

// ---- Lottie wrapper ----
type LottieProps = React.HTMLAttributes<HTMLElement> & {
  src?: string;
  background?: string;
  speed?: number | string;
  loop?: boolean;
  autoplay?: boolean;
  mode?: string;
  style?: React.CSSProperties;
};
const LottiePlayer = (props: LottieProps) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createElement("lottie-player" as any, props as any);
};

// ---- Cloudflare Turnstile typings ----
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          size?: "invisible" | "compact" | "normal";
          theme?: "auto" | "light" | "dark";
          appearance?: "always" | "execute" | "interaction-only";
          retry?: "auto" | "never";
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          callback?: (token: string) => void;
        }
      ) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
      getResponse: (widgetId: string) => string;
    };
  }
}

// ---- Error helpers ----
function extractMessage(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    const nested = obj.error;
    if (nested && typeof nested === "object") {
      const m = (nested as Record<string, unknown>).message;
      if (typeof m === "string") return m;
    }
  }
  return "";
}
function friendlyError(status: number | null, raw: unknown): string {
  const text = extractMessage(raw);
  const lower = text.toLowerCase();
  if (status === 429) {
    if (/daily limit|daily/i.test(lower)) return "You’ve reached your daily limit. Please try again tomorrow.";
    return "You've submitted too many requests. Please try again in a moment.";
  }
  if (status === 400 && /(human|verification|turnstile|challenge)/i.test(lower)) {
    return "Human verficiation check failed. Please refresh the page and try again.";
  }
  if (/content|safety|policy|unsafe|inappropriate/i.test(lower)) {
    return "That prompt isn’t allowed. Try rewording in a family-friendly way.";
  }
  if (!status && !text) return "Network issue. Check your connection and try again.";
  if (status === 402 || status === 403 || (status !== null && status >= 500) || /quota|billing|credit|provider|openai/i.test(lower)) {
    return "Temporary issue — we’re on it. Please try again later.";
  }
  return "Temporary issue — we’re on it. Please try again later.";
}

type Props = {
  themeKey: ThemeKey;
  theme: ThemeConfig;
};

export default function ThemedGenerateClient({ themeKey, theme }: Props) {
  const router = useRouter();
  const { prompt, setPrompt, images, setImages, chosenImage, setChosenImage } = useDesignStore();

  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);

  // queued + generating popups
  const [queuedOpen, setQueuedOpen] = useState(false);
  const queuedSinceRef = useRef<number | null>(null);
  const [generatingOpen, setGeneratingOpen] = useState(false);

  // user-friendly error dialog
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // modal options
  const [styleKey, setStyleKey] = useState<string>(theme.styles[0]?.key ?? "other");
  const [customStyle, setCustomStyle] = useState("");
  const [transparent, setTransparent] = useState(false);
  const [relaxedFilter, setRelaxedFilter] = useState(false);
  const [refPreview, setRefPreview] = useState<string | null>(null);

  // reference uploader state
  const refFileInputRef = useRef<HTMLInputElement | null>(null);
  const [refDragging, setRefDragging] = useState(false);

  // check refernece image
  const [precheckOpen, setPrecheckOpen] = useState(false);

  // styles accordion collapsed on mobile
  const [stylesOpen, setStylesOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) setStylesOpen(false);
  }, []);

  // top banner
  const [showBanner, setShowBanner] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem("tl_banner_dismissed");
    if (v === "1") setShowBanner(false);
  }, []);
  const dismissBanner = () => {
    setShowBanner(false);
    try { localStorage.setItem("tl_banner_dismissed", "1"); } catch {}
  };

  // upload -> editor
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // showcase auto-scroll
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    let dir = 1;
    const id = window.setInterval(() => {
      if (!el) return;
      el.scrollLeft += 2 * dir;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 2) dir = -1;
      if (el.scrollLeft <= 0) dir = 1;
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  // Build final prompt from preset (no free-text prompt on this page)
  const selectedPreset = theme.styles.find((s) => s.key === styleKey);
  const selectedToken = selectedPreset?.token ?? "";
  const finalStyle = styleKey === "other" ? customStyle.trim() : selectedToken;

  function buildFinalPrompt() {
    const parts = [finalStyle];
    if (transparent) parts.push("transparent background, sticker-style, no backdrop, no shadows");
    if (refPreview) parts.push("inspired by an uploaded reference image");
    if (relaxedFilter) parts.push("PG-13, non-explicit, no nudity, non-sexualized, family-friendly");
    parts.push("high contrast, sharp, high-quality");
    return parts.filter(Boolean).join(", ");
  }

  const onClickGenerate = () => {
    if (!refPreview) {
      setErrorMsg("Please upload a photo first.");
      setErrorOpen(true);
      return;
    }
    if (theme.precheck) {
        setPrecheckOpen(true);
    } else {
    setOpenModal(true);
    }
  };

  // ---- Turnstile (invisible) ----
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const tsContainerRef = useRef<HTMLDivElement | null>(null);
  const tsWidgetIdRef = useRef<string | null>(null);
  const tsResolverRef = useRef<((token: string) => void) | null>(null);

  const ensureTurnstileScript = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const ID = "cf-turnstile-api";
    if (document.getElementById(ID)) return;
    await new Promise<void>((resolve) => {
      const s = document.createElement("script");
      s.id = ID;
      s.src = SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  };

  useEffect(() => {
    (async () => {
      if (!siteKey) return;
      if (typeof window === "undefined") return;
      await ensureTurnstileScript();
      if (!window.turnstile) return;
      if (!tsContainerRef.current) return;
      if (tsWidgetIdRef.current) return;

      tsWidgetIdRef.current = window.turnstile.render(tsContainerRef.current, {
        sitekey: siteKey,
        size: "invisible",
        appearance: "execute",
        callback: (token: string) => {
          const resolve = tsResolverRef.current;
          tsResolverRef.current = null;
          if (resolve) resolve(token);
        },
        "error-callback": () => {
          const id = tsWidgetIdRef.current!;
          try { window.turnstile?.reset(id); window.turnstile?.execute(id); } catch {}
        },
        "expired-callback": () => {},
      });
    })();
  }, [siteKey]);

  async function getHumanToken(): Promise<string | null> {
    if (!siteKey || typeof window === "undefined") return null;
    await ensureTurnstileScript();

    const waitForScript = () =>
      new Promise<void>((resolve) => {
        if (window.turnstile) return resolve();
        let tries = 0;
        const id = window.setInterval(() => {
          if (window.turnstile || tries++ > 40) { window.clearInterval(id); resolve(); }
        }, 50);
      });
    await waitForScript();
    if (!window.turnstile) return null;

    if (!tsWidgetIdRef.current && tsContainerRef.current) {
      tsWidgetIdRef.current = window.turnstile.render(tsContainerRef.current, {
        sitekey: siteKey,
        size: "invisible",
        appearance: "execute",
        callback: (token: string) => {
          const resolve = tsResolverRef.current;
          tsResolverRef.current = null;
          if (resolve) resolve(token);
        },
        "error-callback": () => {
          const id = tsWidgetIdRef.current!;
          try { window.turnstile?.reset(id); window.turnstile?.execute(id); } catch {}
        },
        "expired-callback": () => {},
      });
    }

    if (!tsWidgetIdRef.current) return null;

    return new Promise<string>((resolve) => {
      tsResolverRef.current = resolve;
      try { window.turnstile!.execute(tsWidgetIdRef.current!); } catch { resolve(""); }
    });
  }

  // polling
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  type JobStatus = "queued" | "working" | "done" | "failed";
  interface JobResponse { status: JobStatus; images?: string[]; error?: string; }

  async function pollJob(jobId: string): Promise<string[]> {
    let attempt = 0;
    while (true) {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch job status");
      const data = (await res.json()) as JobResponse;

      if (data.status === "queued") {
        if (queuedSinceRef.current == null) queuedSinceRef.current = Date.now();
        const waited = Date.now() - queuedSinceRef.current;
        if (!queuedOpen && waited > 5000) setQueuedOpen(true);
      } else {
        queuedSinceRef.current = null;
        if (queuedOpen) setQueuedOpen(false);
      }

      if (data.status === "working") {
        if (!generatingOpen) setGeneratingOpen(true);
      } else if (data.status === "done" || data.status === "failed" || data.status === "queued") {
        if (generatingOpen) setGeneratingOpen(false);
      }

      if (data.status === "done") return data.images ?? [];
      if (data.status === "failed") throw new Error(data.error || "Generation failed.");

      const delay = Math.min(1500 * Math.pow(1.3, attempt++), 5000);
      await sleep(delay);
    }
  }

  const VARIANTS = 3;

  const reallyGenerate = async () => {
    const finalPrompt = buildFinalPrompt();
    setOpenModal(false);
    setLoading(true);
    setChosenImage(null);
    setImages([]);
    setGeneratingOpen(true);

    // GTM
    gtmPush({
      event: "generate_start",
      theme: themeKey,
      style_key: styleKey,
      transparent,
      aspect: "1:1",
      variants: VARIANTS,
    });

    try {
      const humanToken = await getHumanToken();

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          count: VARIANTS,
          size: "1024x1024",
          quality: "low",
          transparent_background: transparent,
          ref_data_url: refPreview || null,    // REQUIRED: we push the uploaded image
          turnstile_token: humanToken || undefined,
        }),
      });

      if (res.status === 202) {
        const { jobId } = (await res.json()) as { jobId: string };
        const imgs = await pollJob(jobId);
        setImages(imgs);
        return;
      }

      if (res.ok) {
        const data = (await res.json()) as { images?: string[]; error?: string };
        if (!data.images) throw new Error(data.error || "No images returned.");
        setImages(data.images);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const msg = friendlyError(res.status ?? null, (data as { error?: string }).error || data);
      throw new Error(msg);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Temporary issue — we’re on it. Please try again later.";
      setErrorMsg(msg);
      setErrorOpen(true);
    } finally {
      setLoading(false);
      setQueuedOpen(false);
      queuedSinceRef.current = null;
      setGeneratingOpen(false);
    }
  };

  // Upload → editor (kept for “Skip AI — upload finished design” removal, but still used in editor flow)
  const onDesignUpload = (file: File | null) => {
    if (!file) return;
    const ok = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!ok.includes(file.type)) {
      setErrorMsg("Please upload a PNG, JPG, WebP, or SVG.");
      setErrorOpen(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setChosenImage(dataUrl);
      setImages([]);
      router.push("/edit");
    };
    reader.readAsDataURL(file);
  };

  const onRefFile = (file: File | null) => {
    if (!file) return setRefPreview(null);
    const okTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!okTypes.includes(file.type)) {
      setErrorMsg("Please upload a PNG, JPG, or WebP.");
      setErrorOpen(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRefPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const canContinue = Boolean(chosenImage);

  return (
    <div className="text-[#222222]">
      {/* Invisible Turnstile mount */}
      <div ref={tsContainerRef} style={{ display: "none" }} />

      {/* Header */}
      <header className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Threadlab home">
            <img
              src="/logo.webp"
              alt="Threadlab"
              className="h-7 w-auto"
              onError={(e) => {
                const img = e.currentTarget;
                const span = document.createElement("span");
                span.textContent = "Threadlab";
                span.className = "text-lg font-semibold";
                img.replaceWith(span);
              }}
            />
          </Link>
          <a href="https://threadlabs.app" target="_blank" rel="noreferrer" className="text-[#007AFF] underline">
            Back to threadlabs.app
          </a>
        </div>
      </header>

      {/* Top banner — disclaimers */}
      {showBanner && (
        <div className="mx-auto mb-2 w-full max-w-6xl px-4">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFF] p-3 text-xs text-zinc-700">
            <div>
              <div className="font-medium">Best on Wi-Fi.</div>
              <div className="mt-0.5">
                We use OpenAI image generation. Harmful or explicit content won’t be generated or printed{" "}
                <a
                  href="https://openai.com/policies/usage-policies"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#007AFF] underline"
                >
                  Guidelines
                </a>
              </div>
            </div>
            <button aria-label="Dismiss" onClick={dismissBanner} className="shrink-0 rounded-md px-2 py-1 text-zinc-500 hover:bg-white">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto w-full max-w-4xl px-4 pt-4 pb-2 text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">{theme.title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg">{theme.subtitle}</p>
        <div className="mt-4 text-sm">
          <span>500,000 AI Designs Created</span>
          <span className="px-2">•</span>
          <span>No account needed</span>
          <span className="px-2">•</span>
          <span>Free previews</span>
          <span className="px-2">•</span>
          <span>Secure checkout</span>
        </div>
      </section>

      {/* App section */}
      <section className="mx-auto mt-4 w-full max-w-5xl px-3">
        <div className="flex justify-center">
            <Stepper current={1} />
        </div>

        {/* HERO: Dropzone & CTA (NO free-text prompt, NO surprise/skip buttons) */}
        <section className="mx-auto mt-2 w-full max-w-5xl">
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">

              {/* Hidden file input (shared) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => onDesignUpload(e.target.files?.[0] ?? null)}
              />

              {/* Big Upload Dropzone (reference image is required) */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => refFileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") refFileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setRefDragging(true);
                }}
                onDragLeave={() => setRefDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setRefDragging(false);
                  const f = e.dataTransfer.files?.[0] ?? null;
                  onRefFile(f);
                }}
                className={`w-full rounded-xl border-2 border-dashed p-6 text-center transition ${
                  refDragging ? "border-zinc-800 bg-zinc-50" : "border-zinc-300 hover:bg-zinc-50"
                } cursor-pointer`}
              >
                {refPreview ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={refPreview} alt="Reference" className="h-28 w-28 rounded border object-cover" />
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-9" onClick={() => refFileInputRef.current?.click()}>
                        Change
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-9 text-red-600 hover:text-red-700"
                        onClick={() => {
                          setRefPreview(null);
                          if (refFileInputRef.current) refFileInputRef.current.value = "";
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-base font-medium">{theme.dropzoneTitle ?? "Upload a photo"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{theme.dropzoneHelp ?? "PNG, JPG or WebP"}</div>
                  </>
                )}
              </div>

              {/* Hidden input for the reference (used by dropzone above and modal) */}
              <input
                ref={refFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => onRefFile(e.target.files?.[0] ?? null)}
              />

              {/* CTA (Generate only) */}
              <div className="w-full">
                <Button
                  onClick={onClickGenerate}
                  disabled={!refPreview}
                  className="h-12 w-full rounded-xl bg-[#FF375F] px-6 text-white hover:bg-[#e03256] disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">Generating
                      <span className="inline-flex items-center gap-1 align-middle">
                        <span className="inline-block animate-bounce [animation-delay:-0.2s]">•</span>
                        <span className="inline-block animate-bounce [animation-delay:-0.1s]">•</span>
                        <span className="inline-block animate-bounce">•</span>
                      </span>
                    </span>
                  ) : (
                    "Generate with AI"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* RESULTS */}
        <section className="mx-auto mt-5 w-full max-w-5xl">
          {loading && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {Array.from({ length: VARIANTS }).map((_, i) => (
                  <div key={i} className="aspect-square w-full animate-pulse rounded-xl bg-zinc-100" />
                ))}
              </div>
              <div className="mt-3 text-sm">Generating images <span className="inline-flex items-center gap-1 align-middle">
                <span className="inline-block animate-bounce [animation-delay:-0.2s]">•</span>
                <span className="inline-block animate-bounce [animation-delay:-0.1s]">•</span>
                <span className="inline-block animate-bounce">•</span>
              </span></div>
            </div>
          )}

          {!loading && images.length > 0 && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {images.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setChosenImage(url)}
                    className={`group relative overflow-hidden rounded-xl border bg-white transition hover:shadow ${
                      chosenImage === url ? "ring-2 ring-black" : ""
                    }`}
                    title="Select this design"
                  >
                    <img src={url} alt={`generated ${idx + 1}`} className="aspect-square w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 rounded-xl ring-inset transition group-hover:ring-2 group-hover:ring-zinc-300" />
                  </button>
                ))}
              </div>

              {/* Refine & Continue (unchanged functionality) */}
              <div className="mt-4 rounded-xl border bg-zinc-50 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">Want tweaks? Add details and regenerate.</p>
                  <div className="flex gap-2">
                    <Button
                      disabled={!canContinue}
                      onClick={() => router.push("/edit")}
                      className="rounded-xl bg-black text-white hover:bg-zinc-900 disabled:opacity-40"
                    >
                      Continue to Editor →
                    </Button>
                  </div>
                </div>

                {/* Local refine text box (kept) */}
                <RefineBox
                  onRun={async (refineText) => {
                    setPrompt(refineText);
                    setLoading(true);
                    setChosenImage(null);
                    setImages([]);
                    try {
                      const token = await getHumanToken();
                      const res = await fetch("/api/generate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          prompt: refineText,
                          count: VARIANTS,
                          size: "1024x1024",
                          quality: "low",
                          transparent_background: transparent,
                          ref_data_url: refPreview || null,
                          turnstile_token: token || undefined,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        const msg = friendlyError(res.status ?? null, data?.error || data);
                        throw new Error(msg);
                      }
                      setImages(data.images || []);
                    } catch (e: unknown) {
                      console.error(e);
                      setErrorMsg(friendlyError(null, e));
                      setErrorOpen(true);
                    } finally {
                      setLoading(false);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </section>
      </section>

      {/* How ThreadLabs Works (theme-specific) */}
      {theme.howItWorks && theme.howItWorks.length > 0 && (
        <section className="mx-auto mt-12 w-full max-w-6xl px-4">
          <h2 className="mb-4 text-xl font-semibold text-center">How ThreadLabs Works</h2>

          <div className="space-y-4">
            {theme.howItWorks.map((step, i) => {
              // Desktop alternating; Mobile = image first always
              const imgOrder = i % 2 === 1 ? "order-1 md:order-1" : "order-1 md:order-2";
              const textOrder = i % 2 === 1 ? "order-2 md:order-2" : "order-2 md:order-1";

              return (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-2 items-center gap-6 md:gap-10 rounded-2xl border bg-white p-5 shadow-sm"
                >
                  {/* Image/GIF */}
                  <div className={imgOrder}>
                    <img
                      src={step.media}
                      alt={step.mediaAlt || step.title}
                      loading="lazy"
                      className="w-full rounded-xl object-cover"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </div>

                  {/* Text */}
                  <div className={textOrder}>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm text-zinc-700">{step.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}   


      {/* Showcase Carousel (theme-specific) */}
      <section className="mx-auto mt-12 w-full max-w-6xl px-4 pb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Made with ThreadLabs</h2>
          <a href="https://threadlabs.app" target="_blank" rel="noreferrer" className="text-sm text-[#007AFF] underline">
            See more
          </a>
        </div>
        <div
          ref={showcaseRef}
          className="no-scrollbar flex gap-4 overflow-x-auto rounded-2xl border bg-white p-4 shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {theme.showcaseImages.map((src, i) => (
            <div key={`${src}-${i}`} className="shrink-0">
              <img
                src={src}
                alt={`showcase ${i + 1}`}
                loading="lazy"
                className="h-48 w-48 rounded-xl object-cover sm:h-56 sm:w-56"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Footer (unchanged) */}
      <footer className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="font-semibold">Threadlab</span>
            <p className="mt-1 text-sm">Create, customize, and wear your ideas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:justify-end">
            <a href="https://threadlabs.app/terms-of-service/" className="text-[#007AFF] underline" target="_blank" rel="noreferrer">
              Terms of Service
            </a>
            <a href="https://threadlabs.app/return-policy/" className="text-[#007AFF] underline" target="_blank" rel="noreferrer">
              Returns & Refunds
            </a>
            <a href="https://threadlabs.app/content-copyright-policy/" className="text-[#007AFF] underline" target="_blank" rel="noreferrer">
              Content & Copyright Policy
            </a>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 text-xs">© {new Date().getFullYear()} Threadlab. All rights reserved.</div>
      </footer>


    {/* PRECHECK POPUP (theme-specific) */}
    <Dialog open={precheckOpen} onOpenChange={setPrecheckOpen}>
        <DialogContent className="max-w-lg">
            <DialogHeader className="text-center">
                <DialogTitle className="text-center">{theme.precheck?.title ?? "Before you proceed"}</DialogTitle>
            </DialogHeader>

            <p className="mx-auto mb-3 max-w-md text-center text-sm text-zinc-600">
                {theme.precheck?.description ?? "Use a clear, front-facing photo. See examples below."}
            </p>

            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-2 text-center">
                    <div className="mb-1 text-xs font-medium text-red-600">Bad example</div>
                    <img
                        src={theme.precheck?.badExample || "/precheck/bad.webp"}
                        alt="Bad example"
                        className="aspect-square w-full rounded-lg object-cover"
                    />
                </div>
                <div className="rounded-xl border p-2 text-center">
                    <div className="mb-1 text-xs font-medium text-green-600">Good example</div>
                    <img
                        src={theme.precheck?.goodExample || "/precheck/good.webp"}
                        alt="Good example"
                        className="aspect-square w-full rounded-lg object-cover"
                    />
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
                <Button
                    className="h-11 w-full rounded-xl bg-[#FF375F] text-white hover:bg-[#e03256]"
                    onClick={() => {
                        setPrecheckOpen(false);
                        setOpenModal(true); // go to existing Style/options modal
                    }}
                >
                    Proceed →
                </Button>

                <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl"
                    onClick={() => {
                        setPrecheckOpen(false);
                        refFileInputRef.current?.click(); // let them pick a new image
                    }}
                >
                    Upload a different image
                </Button>
            </div>
        </DialogContent>
    </Dialog>
   
      {/* MODAL: Style / Transparent / Reference (kept; styles are theme-specific) */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden overscroll-contain break-words">
          <DialogHeader>
            <DialogTitle>Style & options</DialogTitle>
          </DialogHeader>

          {/* Styles (theme presets) */}
          <div className="mt-2">
            <details
              open={stylesOpen}
              onToggle={(e) => setStylesOpen((e.currentTarget as HTMLDetailsElement).open)}
              className="rounded-lg border bg-white"
            >
              <summary className="flex min-w-0 items-center gap-2 cursor-pointer select-none rounded-lg px-3 py-2 pr-8 text-sm font-medium whitespace-normal break-words list-none [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">Styles {styleKey ? <span className="text-zinc-500">— {theme.styles.find((s) => s.key === styleKey)?.label}</span> : null}</span>
              </summary>

              <div className="border-t p-3 min-w-0">
                <div className="flex min-w-0 flex-wrap gap-2">
                  {theme.styles.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setStyleKey(s.key)}
                      className={`flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm whitespace-normal break-words transition ${
                        styleKey === s.key ? "ring-2 ring-black" : "border bg-white hover:bg-zinc-50"
                      }`}
                      title={s.label}
                    >
                      <img
                        src={`/styles/${s.key}.jpg`}
                        alt=""
                        className="h-6 w-6 flex-shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                        loading="lazy"
                      />
                      {s.label}
                    </button>
                  ))}
                </div>

                {styleKey === "other" && (
                  <Input
                    value={customStyle}
                    onChange={(e) => setCustomStyle(e.target.value)}
                    placeholder="Describe the style (e.g. watercolor, stencil, cyberpunk neon)"
                    className="mt-3"
                  />
                )}
              </div>
            </details>
          </div>

          {/* Toggles */}
          <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            <label htmlFor="transparent-bg" className="flex min-w-0 items-center gap-2">
              <input id="transparent-bg" type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm whitespace-normal break-words">Transparent background</span>
            </label>

            <label htmlFor="relaxed-filter" className="flex min-w-0 items-start gap-2">
              <input id="relaxed-filter" type="checkbox" checked={relaxedFilter} onChange={(e) => setRelaxedFilter(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span className="text-sm whitespace-normal break-words">
                Relaxed filtering <span className="block text-xs text-zinc-500">(May allow edgier themes; no explicit content)</span>
              </span>
            </label>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="outline" onClick={() => setOpenModal(false)} className="w-full whitespace-normal break-words sm:w-auto">
              Cancel
            </Button>
            <Button onClick={() => void reallyGenerate()} className="w-full whitespace-normal break-words bg-[#FF375F] text-white hover:bg-[#e03256] sm:w-auto">
              Apply & Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUEUED POPUP */}
      <Dialog open={queuedOpen} onOpenChange={setQueuedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Queued — starting soon</DialogTitle>
          </DialogHeader>
        <p className="text-sm">
            Your request is in line. Estimated start: <b>~15–30 seconds</b>. This will update automatically—no need to refresh.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setQueuedOpen(false)}>
              Hide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GENERATING POPUP */}
      <Dialog open={generatingOpen}>
        <DialogContent
          className="max-w-sm text-center [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-center">Your design is coming to life</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center">
            <LottiePlayer src="/lotties/generating.json" background="transparent" speed="1" style={{ width: 220, height: 220 }} loop autoplay />
            <p className="mt-2 text-sm text-zinc-600">
              This usually takes <b>15–30 seconds</b>. For the smoothest experience, stay on Wi-Fi.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ERROR POPUP */}
      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="max-w-sm p-6 text-center">
          <div className="flex flex-col items-center">
            <img src="/icons/error.webp" alt="error" className="mb-3 h-16 w-16" onError={(e) => (e.currentTarget.style.display = "none")} />
            <DialogHeader className="items-center text-center">
              <DialogTitle className="text-center">Uh Ohhhh!</DialogTitle>
            </DialogHeader>
            <p className="mt-1 text-sm text-zinc-600">{errorMsg}</p>
            <DialogFooter className="mt-5 flex justify-center">
              <Button onClick={() => setErrorOpen(false)} className="rounded-xl bg-[#FF375F] text-white hover:bg-[#e03256]">
                Try again
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small local component for refine box (kept unchanged behavior) */
function RefineBox({ onRun }: { onRun: (refineText: string) => void | Promise<void> }) {
  const [showRefine, setShowRefine] = useState(false);
  const [refine, setRefine] = useState("");
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">Want tweaks? Adjust the prompt and regenerate.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRefine((s) => !s)}>
            {showRefine ? "Hide changes" : "Make changes"}
          </Button>
        </div>
      </div>

      {showRefine && (
        <div className="mt-3 grid gap-2 sm:flex sm:items-center">
          <Input
            value={refine}
            onChange={(e) => setRefine(e.target.value)}
            placeholder="Add or change details… (e.g. fewer colours, thicker outline)"
            className="h-11 w-full"
          />
          <Button onClick={() => onRun(refine)} className="h-11">
            Regenerate with changes
          </Button>
        </div>
      )}
    </>
  );
}