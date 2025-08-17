"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignStore, Color, Material, Side } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/* ---------- Pricing ---------- */
const COLORS: Color[] = ["white", "black", "navy"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const MATERIALS: Material[] = ["standard", "eco", "premium"];

const BASE_PRICE_MATERIAL: Record<Material, number> = {
  standard: 12,
  eco: 14,
  premium: 18,
};
const COLOR_SURCHARGE: Record<Color, number> = {
  white: 0,
  black: 1,
  navy: 0.5,
};
const SIZE_SURCHARGE: Record<string, number> = {
  XS: 0,
  S: 0,
  M: 0,
  L: 0,
  XL: 1.5,
  XXL: 2.5,
};
const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/* ---------- Mockups (side+color) ---------- */
const TEE_MAP: Record<Side, Record<Color, string>> = {
  front: {
    white: "/mockups/tee_white_front.png",
    black: "/mockups/tee_black_front.png",
    navy: "/mockups/tee_navy_front.png",
  },
  back: {
    white: "/mockups/tee_white_back.png",
    black: "/mockups/tee_black_back.png",
    navy: "/mockups/tee_navy_back.png",
  },
};
const TEE_FALLBACK = "/tee.png";

/* ---------- Helpers ---------- */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

type GestureMode = "none" | "drag" | "scale" | "rotate" | "pinch";

type Snapshot = {
  x: number;
  y: number;
  scalePct: number;
  rotationDeg: number;
  opacity: number;
  side: Side;
  color: Color;
  size: string;
  material: Material;
};

function Dots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block animate-bounce [animation-delay:-0.2s]">•</span>
      <span className="inline-block animate-bounce [animation-delay:-0.1s]">•</span>
      <span className="inline-block animate-bounce">•</span>
    </span>
  );
}

export default function EditPage() {
  const router = useRouter();
  const {
    chosenImage,
    side,
    color,
    size,
    material,
    setSide,
    setColor,
    setSize,
    setMaterial,
  } = useDesignStore();

  useEffect(() => {
    if (!chosenImage) router.replace("/generate");
  }, [chosenImage, router]);

  /* ---------- Editor state ---------- */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const teeImgRef = useRef<HTMLImageElement | null>(null);

  const [scalePct, setScalePct] = useState(60);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [imgRatio, setImgRatio] = useState(1);
  const [teeRatio, setTeeRatio] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const [teeLoaded, setTeeLoaded] = useState(false);
  const [artLoaded, setArtLoaded] = useState(false);

  // Saved print file URL from /api/print-file
  const [printFileUrl, setPrintFileUrl] = useState<string | null>(null);
  const [savingPrint, setSavingPrint] = useState(false);

  const modeRef = useRef<GestureMode>("none");
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startScale: 60,
    startRotation: 0,
    startDist: 0,
    startAngle: 0,
  });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const [qty, setQty] = useState<number>(1);

  /* ---------- Geometry ---------- */
  const containerW = containerRef.current?.clientWidth ?? 0;
  const containerH = containerRef.current?.clientHeight ?? 0;

  const safeRect = useMemo(() => {
    const w = containerW;
    const h = containerH;
    return {
      x: 0.5 * w - 0.65 * w * 0.5,
      y: 0.34 * h - 0.45 * h * 0.5,
      w: 0.65 * w,
      h: 0.45 * h,
    };
  }, [containerW, containerH]);

  const designWidthPx = useMemo(() => {
    if (!containerW) return 0;
    const desired = Math.max(40, (scalePct / 100) * containerW * 0.8);
    return Math.min(desired, safeRect.w || desired);
  }, [containerW, scalePct, safeRect.w]);

  const designHeightPx = useMemo(
    () => Math.max(40, designWidthPx * imgRatio),
    [designWidthPx, imgRatio]
  );

  /* ---------- Snap guides ---------- */
  const [vGuide, setVGuide] = useState<number | null>(null);
  const [hGuide, setHGuide] = useState<number | null>(null);
  const guideTimer = useRef<number | null>(null);
  const SNAP = 8;

  const clearGuidesSoon = () => {
    if (guideTimer.current) window.clearTimeout(guideTimer.current);
    guideTimer.current = window.setTimeout(() => {
      setVGuide(null);
      setHGuide(null);
    }, 350);
  };

  const applySnap = (x: number, y: number) => {
    let sx = x;
    let sy = y;
    let showV: number | null = null;
    let showH: number | null = null;

    const halfW = designWidthPx / 2;
    const halfH = designHeightPx / 2;
    const centerX = safeRect.x + safeRect.w / 2;
    const centerY = safeRect.y + safeRect.h / 2;
    const leftX = safeRect.x + halfW;
    const rightX = safeRect.x + safeRect.w - halfW;
    const topY = safeRect.y + halfH;
    const bottomY = safeRect.y + safeRect.h - halfH;

    if (Math.abs(x - centerX) <= SNAP) {
      sx = centerX;
      showV = centerX;
    } else if (Math.abs(x - leftX) <= SNAP) {
      sx = leftX;
      showV = safeRect.x;
    } else if (Math.abs(x - rightX) <= SNAP) {
      sx = rightX;
      showV = safeRect.x + safeRect.w;
    }

    if (Math.abs(y - centerY) <= SNAP) {
      sy = centerY;
      showH = centerY;
    } else if (Math.abs(y - topY) <= SNAP) {
      sy = topY;
      showH = safeRect.y;
    } else if (Math.abs(y - bottomY) <= SNAP) {
      sy = bottomY;
      showH = safeRect.y + safeRect.h;
    }

    setVGuide(showV);
    setHGuide(showH);
    if (showV || showH) clearGuidesSoon();
    return { x: sx, y: sy };
  };

  const clampCenterToSafe = (x: number, y: number) => {
    const halfW = designWidthPx / 2;
    const halfH = designHeightPx / 2;
    const minX = safeRect.x + halfW;
    const maxX = safeRect.x + safeRect.w - halfW;
    const minY = safeRect.y + halfH;
    const maxY = safeRect.y + safeRect.h - halfH;
    if (minX > maxX || minY > maxY) {
      return { x: safeRect.x + safeRect.w / 2, y: safeRect.y + safeRect.h / 2 };
    }
    const clamped = { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
    return applySnap(clamped.x, clamped.y);
  };

  const centerDesign = () => {
    setPos({ x: safeRect.x + safeRect.w / 2, y: safeRect.y + safeRect.h / 2 });
  };

  useEffect(() => {
    centerDesign();
    const onResize = () => centerDesign();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenImage]);

  useEffect(() => {
    setPos((p) => clampCenterToSafe(p.x, p.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designWidthPx, designHeightPx]);

  /* ---------- Mockup src ---------- */
  const teeSrc = useMemo(() => {
    return (TEE_MAP[side] && TEE_MAP[side][color]) || TEE_FALLBACK;
  }, [side, color]);

  /* ---------- Pointer logic ---------- */
  const getLocalXY = (e: PointerEvent | React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e as PointerEvent).clientX - rect.left,
      y: (e as PointerEvent).clientY - rect.top,
    };
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    Math.atan2(to.y - from.y, to.x - from.x);

  const onDesignPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    modeRef.current = "drag";
    const p = getLocalXY(e);
    gesture.current.startX = p.x - pos.x;
    gesture.current.startY = p.y - pos.y;
    pointers.current.set(e.pointerId, p);
  };
  const onDesignPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, getLocalXY(e));
    if (modeRef.current === "drag") {
      const p = getLocalXY(e);
      setPos(clampCenterToSafe(p.x - gesture.current.startX, p.y - gesture.current.startY));
    }
    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values()).slice(0, 2);
      if (modeRef.current !== "pinch") {
        modeRef.current = "pinch";
        gesture.current.startDist = dist(a, b);
        gesture.current.startScale = scalePct;
      } else {
        const factor = dist(a, b) / Math.max(1, gesture.current.startDist);
        const next = clamp(Math.round(gesture.current.startScale * factor), 10, 200);
        setScalePct(next);
      }
    }
  };
  const onDesignPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && modeRef.current === "pinch") modeRef.current = "none";
    if (modeRef.current === "drag") modeRef.current = "none";
  };

  /* ---------- Scale/Rotate ---------- */
  const onScaleHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    modeRef.current = "scale";
    const p = getLocalXY(e);
    gesture.current.startDist = dist({ x: pos.x, y: pos.y }, p);
    gesture.current.startScale = scalePct;
  };
  const onScaleHandleMove = (e: React.PointerEvent) => {
    if (modeRef.current !== "scale") return;
    const p = getLocalXY(e);
    const f = dist({ x: pos.x, y: pos.y }, p) / Math.max(1, gesture.current.startDist);
    const next = clamp(Math.round(gesture.current.startScale * f), 10, 200);
    setScalePct(next);
  };
  const onScaleHandleUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (modeRef.current === "scale") modeRef.current = "none";
  };

  const SNAP_ANGLE = 15;
  const MAGNET = 4;

  const onRotateHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    modeRef.current = "rotate";
    const p = getLocalXY(e);
    gesture.current.startAngle = angleTo({ x: pos.x, y: pos.y }, p);
    gesture.current.startRotation = rotationDeg;
  };
  const onRotateHandleMove = (e: React.PointerEvent) => {
    if (modeRef.current !== "rotate") return;
    const p = getLocalXY(e);
    const a = angleTo({ x: pos.x, y: pos.y }, p);
    const deltaDeg = deg(a - gesture.current.startAngle);
    let next = gesture.current.startRotation + deltaDeg;
    if (e.shiftKey) {
      next = Math.round(next / SNAP_ANGLE) * SNAP_ANGLE;
    } else {
      const nearest = Math.round(next / SNAP_ANGLE) * SNAP_ANGLE;
      if (Math.abs(nearest - next) <= MAGNET) next = nearest;
    }
    next = clamp(Math.round(next), -45, 45);
    setRotationDeg(next);
  };
  const onRotateHandleUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (modeRef.current === "rotate") modeRef.current = "none";
  };

  /* ---------- Wheel zoom ---------- */
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY;
    const next = clamp(scalePct + (delta > 0 ? -3 : 3), 10, 200);
    setScalePct(next);
  };

  /* ---------- Undo/Redo ---------- */
  const isTextInput = (el: Element | null) =>
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      (el as HTMLElement).isContentEditable);

  const history = useRef<Snapshot[]>([]);
  const index = useRef<number>(-1);
  const applyingHistory = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const debTimer = useRef<number | null>(null);

  const capture = (): Snapshot => ({
    x: pos.x,
    y: pos.y,
    scalePct,
    rotationDeg,
    opacity,
    side,
    color,
    size,
    material,
  });

  const applySnapshot = (s: Snapshot) => {
    applyingHistory.current = true;
    setPos({ x: s.x, y: s.y });
    setScalePct(s.scalePct);
    setRotationDeg(s.rotationDeg);
    setOpacity(s.opacity);
    setSide(s.side);
    setColor(s.color);
    setSize(s.size);
    setMaterial(s.material);
    setTimeout(() => (applyingHistory.current = false), 0);
  };

  const pushHistory = (s: Snapshot) => {
    const last = history.current[index.current];
    const same =
      last &&
      last.x === s.x &&
      last.y === s.y &&
      last.scalePct === s.scalePct &&
      last.rotationDeg === s.rotationDeg &&
      last.opacity === s.opacity &&
      last.side === s.side &&
      last.color === s.color &&
      last.size === s.size &&
      last.material === s.material;
    if (same) return;
    history.current = history.current.slice(0, index.current + 1);
    history.current.push(s);
    index.current++;
    setCanUndo(index.current > 0);
    setCanRedo(index.current < history.current.length - 1);
  };

  useEffect(() => {
    pushHistory(capture());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (applyingHistory.current) return;
    if (debTimer.current) window.clearTimeout(debTimer.current);
    debTimer.current = window.setTimeout(() => pushHistory(capture()), 220);
    return () => {
      if (debTimer.current) window.clearTimeout(debTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y, scalePct, rotationDeg, opacity, side, color, size, material]);

  const undo = () => {
    if (index.current <= 0) return;
    index.current--;
    applySnapshot(history.current[index.current]);
    setCanUndo(index.current > 0);
    setCanRedo(index.current < history.current.length - 1);
  };
  const redo = () => {
    if (index.current >= history.current.length - 1) return;
    index.current++;
    applySnapshot(history.current[index.current]);
    setCanUndo(index.current > 0);
    setCanRedo(index.current < history.current.length - 1);
  };

  /* ---------- Pricing ---------- */
  const unitPrice = useMemo(() => {
    const base = BASE_PRICE_MATERIAL[material] ?? 12;
    const colorFee = COLOR_SURCHARGE[color] ?? 0;
    const sizeFee = SIZE_SURCHARGE[size] ?? 0;
    return Math.max(0, base + colorFee + sizeFee);
  }, [material, color, size]);

  const totalPrice = useMemo(
    () => +(unitPrice * Math.max(1, qty)).toFixed(2),
    [unitPrice, qty]
  );

  /* ---------- Download mockup JPG ---------- */
  const downloadJPG = async () => {
    try {
      if (!containerRef.current) return;
      const W = containerRef.current.clientWidth;
      const H = containerRef.current.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      const tee = new Image();
      tee.crossOrigin = "anonymous";
      tee.src = teeSrc;
      await new Promise<void>((resolve) => {
        tee.onload = () => resolve();
        tee.onerror = () => resolve();
      });
      const teeW = W * 0.9;
      const teeH = teeW * (teeRatio || 1);
      const teeX = (W - teeW) / 2;
      const teeY = (H - teeH) / 2;
      if (tee.complete) ctx.drawImage(tee, teeX, teeY, teeW, teeH);

      const art = new Image();
      art.crossOrigin = "anonymous";
      art.src = chosenImage!;
      await new Promise<void>((resolve) => {
        art.onload = () => resolve();
        art.onerror = () => resolve();
      });
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rad(rotationDeg));
      ctx.globalAlpha = opacity / 100;
      ctx.drawImage(art, -designWidthPx / 2, -designHeightPx / 2, designWidthPx, designHeightPx);
      ctx.restore();
      ctx.globalAlpha = 1;

      const url = canvas.toDataURL("image/jpeg", 0.9);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mockup_${color}_${side}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      alert("Could not export JPG.");
    }
  };

  /* ---------- Advanced: Save print file (URL) ---------- */
  type SaveResp = {
    url?: string;
    pngUrl?: string;
    publicUrl?: string;
    file?: { url?: string };
    error?: string;
  };

  async function handleSavePrintFile() {
    try {
      if (!chosenImage) {
        alert("No design image loaded.");
        return;
      }
      setSavingPrint(true);

      const res = await fetch("/api/print-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: chosenImage }),
      });

      if (!res.ok) {
        const txt = await res.text();
        setSavingPrint(false);
        alert(`Print file failed: ${txt}`);
        return;
      }

      const data = (await res.json()) as SaveResp;
      const url =
        data.url ?? data.pngUrl ?? data.publicUrl ?? data.file?.url ?? null;

      if (!url) {
        setSavingPrint(false);
        alert("Print file created but no URL returned.");
        return;
      }

      setPrintFileUrl(url);
      setSavingPrint(false);
    } catch (err: unknown) {
      console.error(err);
      setSavingPrint(false);
      alert(`Error creating print file: ${String(err)}`);
    }
  }

  // ensure we have a print file before checkout
  async function ensurePrintFile(): Promise<string> {
    if (printFileUrl) return printFileUrl;
    if (!chosenImage) throw new Error("No design image loaded.");
    setSavingPrint(true);

    const res = await fetch("/api/print-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: chosenImage }),
    });

    if (!res.ok) {
      const txt = await res.text();
      setSavingPrint(false);
      throw new Error(txt || "Failed to create print file");
    }

    const data = (await res.json()) as SaveResp;
    const url =
      data.url ?? data.pngUrl ?? data.publicUrl ?? data.file?.url ?? null;

    if (!url) {
      setSavingPrint(false);
      throw new Error("Print file created but no URL returned.");
    }

    setPrintFileUrl(url);
    setSavingPrint(false);
    return url;
  }

  /* ---------- Proceed to payment (Stripe) ---------- */
  async function handleCheckout() {
    try {
      const url = await ensurePrintFile();

      const payload = {
        side,
        color,
        size,
        material,
        qty,
        unitPriceGBP: unitPrice,
        totalPriceGBP: totalPrice,
        printFileUrl: url,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("Checkout failed.");
        return;
      }

      const j = (await res.json()) as { url?: string; error?: string };

      if (j.url) {
        // If the app is embedded (iframe?embed=1), open Stripe in the top window.
        const isEmbedded =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("embed") === "1";

      if (isEmbedded) {
        window.top?.location.assign(j.url);
      } else {
        window.location.assign(j.url);
      }
    } else {
      alert(j.error || "Checkout failed.");
    }


    } catch (e) {
      console.error(e);
      alert(`Could not prepare print file: ${String(e)}`);
    }
  }

  if (!chosenImage) {
    return (
      <>
        <Stepper current={2} />
        <div className="rounded-2xl border bg-white p-6 text-[#222222] shadow-sm">
          No design selected. Go to{" "}
          <Link href="/generate" className="underline">
            Generate
          </Link>
          .
        </div>
      </>
    );
  }

  const allLoaded = teeLoaded && artLoaded;

  return (
    <>
      <Stepper current={2} />

      {/* limit width to viewport & prevent horizontal scroll on mobile */}
      <div className="text-[#222222]">
        <div className="grid max-w-[100vw] gap-6 overflow-x-hidden px-3 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:px-0 lg:pb-0">
          {/* Canvas */}
          <div className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
            <div
              ref={containerRef}
              onWheel={onWheel}
              className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl border bg-white touch-none"
            >
              {!allLoaded && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-white/70">
                  <div className="animate-pulse rounded-xl bg-zinc-200 p-6 text-sm">
                    Preparing editor <Dots />
                  </div>
                </div>
              )}

              <img
                ref={teeImgRef}
                src={teeSrc}
                alt={`T-shirt mockup (${color} ${side})`}
                draggable={false}
                onLoad={(e) => {
                  setTeeLoaded(true);
                  const i = e.currentTarget as HTMLImageElement;
                  if (i.naturalWidth) setTeeRatio(i.naturalHeight / i.naturalWidth);
                }}
                onDragStart={(e) => e.preventDefault()}
                className="pointer-events-none absolute left-1/2 top-1/2 w-[90%] -translate-x-1/2 -translate-y-1/2 select-none"
              />

              <div className="pointer-events-none absolute left-1/2 top-[34%] h-[45%] w-[65%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-black/10" />

              {vGuide !== null && (
                <div
                  className="pointer-events-none absolute top-0 h-full w-px bg-black/20"
                  style={{ left: vGuide }}
                />
              )}
              {hGuide !== null && (
                <div
                  className="pointer-events-none absolute left-0 w-full border-t border-black/20"
                  style={{ top: hGuide }}
                />
              )}

              <div
                className="absolute"
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: `${designWidthPx}px`,
                  height: `${designHeightPx}px`,
                  transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                  touchAction: "none",
                }}
              >
                <img
                  src={chosenImage}
                  alt="Design"
                  onLoad={(e) => {
                    setArtLoaded(true);
                    const i = e.currentTarget;
                    setImgRatio(i.naturalHeight / i.naturalWidth || 1);
                    centerDesign();
                  }}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerDown={onDesignPointerDown}
                  onPointerMove={onDesignPointerMove}
                  onPointerUp={onDesignPointerUp}
                  className="h-full w-full select-none cursor-move rounded-sm shadow-sm"
                  style={{ opacity: opacity / 100 }}
                />

                <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-zinc-400/50" />

                {[
                  { k: "tl", style: "left-0 top-0 -translate-x-1/2 -translate-y-1/2" },
                  { k: "tr", style: "right-0 top-0 translate-x-1/2 -translate-y-1/2" },
                  { k: "bl", style: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2" },
                  { k: "br", style: "right-0 bottom-0 translate-x-1/2 translate-y-1/2" },
                ].map((h) => (
                  <div
                    key={h.k}
                    onPointerDown={onScaleHandleDown}
                    onPointerMove={onScaleHandleMove}
                    onPointerUp={onScaleHandleUp}
                    className={`absolute ${h.style} z-10 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-black`}
                    title="Drag to scale"
                  />
                ))}

                <div
                  onPointerDown={onRotateHandleDown}
                  onPointerMove={onRotateHandleMove}
                  onPointerUp={onRotateHandleUp}
                  className="absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-6 cursor-grab rounded-full border border-white bg-black"
                  title="Drag to rotate (hold Shift to snap)"
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
              <h2 className="text-lg font-semibold">Adjust & Options</h2>
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <Button variant="outline" onClick={undo} disabled={!canUndo}>
                  Undo
                </Button>
                <Button variant="outline" onClick={redo} disabled={!canRedo}>
                  Redo
                </Button>
                <Button variant="outline" onClick={downloadJPG}>
                  Mockup JPG
                </Button>
              </div>
            </div>

            <div className="grid gap-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>Scale</span>
                  <span className="tabular-nums">{scalePct}%</span>
                </div>
                <Slider
                  value={[scalePct]}
                  min={10}
                  max={200}
                  step={1}
                  onValueChange={(v) => setScalePct(v[0] ?? scalePct)}
                  className="[&_.bg-primary]:!bg-[#007AFF] [&_.border-primary]:!border-[#007AFF]"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>Rotation</span>
                  <span className="tabular-nums">{rotationDeg}°</span>
                </div>
                <Slider
                  value={[rotationDeg]}
                  min={-45}
                  max={45}
                  step={1}
                  onValueChange={(v) => setRotationDeg(v[0] ?? rotationDeg)}
                  className="[&_.bg-primary]:!bg-[#007AFF] [&_.border-primary]:!border-[#007AFF]"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>Opacity</span>
                  <span className="tabular-nums">{opacity}%</span>
                </div>
                <Slider
                  value={[opacity]}
                  min={10}
                  max={100}
                  step={1}
                  onValueChange={(v) => setOpacity(v[0] ?? opacity)}
                  className="[&_.bg-primary]:!bg-[#007AFF] [&_.border-primary]:!border-[#007AFF]"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {/* Side */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Side</span>
                <div className="flex flex-wrap gap-2">
                  {(["front", "back"] as Side[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        s === side
                          ? "border-2 border-[#007AFF] bg-white"
                          : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Color</span>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-zinc-50 ${
                        color === c ? "ring-2 ring-[#007AFF]" : ""
                      }`}
                      title={c}
                    >
                      <span
                        className="inline-block h-4 w-4 rounded-full border"
                        style={{
                          background: c === "white" ? "#fff" : c === "black" ? "#111" : "#000080",
                          borderColor: c === "white" ? "#e5e7eb" : "transparent",
                        }}
                      />
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Size</span>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        size === s
                          ? "border-2 border-[#007AFF] bg-white"
                          : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Material */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Material</span>
                <div className="flex flex-wrap gap-2">
                  {MATERIALS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMaterial(m)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        material === m
                          ? "border-2 border-[#007AFF] bg-white"
                          : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Quantity</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                    −
                  </Button>
                  <span className="w-10 text-center tabular-nums">{qty}</span>
                  <Button variant="outline" onClick={() => setQty((q) => q + 1)}>
                    +
                  </Button>
                </div>
              </div>
            </div>

            {/* Advanced (accordion) */}
            <details className="mt-6 rounded-xl border bg-zinc-50 p-4">
              <summary className="cursor-pointer select-none font-medium">
                Advanced
                <span className="ml-2 align-middle text-xs">
                  {printFileUrl ? (
                    <a
                      href={printFileUrl}
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Print file saved
                    </a>
                  ) : (
                    " (no print file saved)"
                  )}
                </span>
              </summary>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleSavePrintFile} disabled={savingPrint}>
                  {savingPrint ? "Saving…" : "Save print file (URL)"}
                </Button>
              </div>
            </details>

            {/* Pricing summary */}
            <div className="mt-6 rounded-xl border bg-zinc-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span>Base ({material})</span>
                <span>{gbp.format(BASE_PRICE_MATERIAL[material])}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Colour adj. ({color})</span>
                <span>{gbp.format(COLOR_SURCHARGE[color])}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Size adj. ({size})</span>
                <span>{gbp.format(SIZE_SURCHARGE[size] ?? 0)}</span>
              </div>
              <div className="my-3 h-px w-full bg-zinc-200" />
              <div className="flex items-center justify-between">
                <span className="text-sm">Unit price</span>
                <span className="font-semibold">{gbp.format(unitPrice)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm">Quantity</span>
                <span className="tabular-nums">{qty}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{gbp.format(totalPrice)}</span>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
              <Link href="/generate" className="text-sm underline">
                ← Back to Generate
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setScalePct(60);
                    setRotationDeg(0);
                    setOpacity(100);
                    centerDesign();
                  }}
                >
                  Reset
                </Button>
                <Button
                  className="rounded-xl bg-[#FF375F] px-6 text-white hover:bg-[#e23355]"
                  onClick={handleCheckout}
                  disabled={savingPrint}
                  title={savingPrint ? "Preparing print file…" : ""}
                >
                  {savingPrint ? "Preparing…" : "Proceed to payment →"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile sticky checkout */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-white/60 lg:hidden">
          <div className="mx-auto flex w-full max-w-screen-sm items-center justify-between gap-3">
            <span className="text-sm">
              Total {gbp.format(totalPrice)}
            </span>
            <Button
              className="rounded-xl bg-[#FF375F] px-6 text-white hover:bg-[#e23355]"
              onClick={handleCheckout}
              disabled={savingPrint}
              title={savingPrint ? "Preparing print file…" : ""}
            >
              {savingPrint ? "Preparing…" : "Proceed to payment →"}
            </Button>
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </div>
    </>
  );
}