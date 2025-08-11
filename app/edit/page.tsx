"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignStore, Color, Material, Side } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/** ---------- Pricing (unchanged) ---------- */
const COLORS: Color[] = ["white", "black", "heather"];
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
  heather: 0.5,
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

/** ---------- Mockup PNG map (side + color) ---------- */
const TEE_MAP: Record<Side, Record<Color, string>> = {
  front: {
    white: "/mockups/tee_white_front.png",
    black: "/mockups/tee_black_front.png",
    heather: "/mockups/tee_heather_front.png",
  },
  back: {
    white: "/mockups/tee_white_back.png",
    black: "/mockups/tee_black_back.png",
    heather: "/mockups/tee_heather_back.png",
  },
};
const TEE_FALLBACK = "/tee.png";

/** ---------- Helpers ---------- */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const deg = (rad: number) => (rad * 180) / Math.PI;

type GestureMode = "none" | "drag" | "scale" | "rotate" | "pinch";

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

  /** ---------- Editor state ---------- */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scalePct, setScalePct] = useState(60);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [imgRatio, setImgRatio] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // center in container px

  // gesture bookkeeping
  const modeRef = useRef<GestureMode>("none");
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startScale: 60,
    startRotation: 0,
    startDist: 0,
    startAngle: 0,
  });

  // track pointers for pinch
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  // quantity for pricing
  const [qty, setQty] = useState<number>(1);

  /** ---------- Geometry ---------- */
  const containerW = containerRef.current?.clientWidth ?? 0;
  const containerH = containerRef.current?.clientHeight ?? 0;

  const safeRect = useMemo(() => {
    const w = containerW,
      h = containerH;
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
    return {
      x: clamp(x, minX, maxX),
      y: clamp(y, minY, maxY),
    };
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

  /** ---------- Mockup selection ---------- */
  const teeSrc = useMemo(() => {
    return (TEE_MAP[side] && TEE_MAP[side][color]) || TEE_FALLBACK;
  }, [side, color]);

  /** ---------- Pointer utilities ---------- */
  const getLocalXY = (e: PointerEvent | React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: (e as PointerEvent).clientX - rect.left, y: (e as PointerEvent).clientY - rect.top };
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    Math.atan2(to.y - from.y, to.x - from.x);

  /** ---------- Drag (move) on image ---------- */
  const onDesignPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    modeRef.current = "drag";
    const p = getLocalXY(e);
    gesture.current.startX = p.x - pos.x;
    gesture.current.startY = p.y - pos.y;

    // track pointer for pinch if a second finger arrives
    pointers.current.set(e.pointerId, p);
  };
  const onDesignPointerMove = (e: React.PointerEvent) => {
    // update tracked pointer
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, getLocalXY(e));
    }

    if (modeRef.current === "drag") {
      const p = getLocalXY(e);
      setPos(clampCenterToSafe(p.x - gesture.current.startX, p.y - gesture.current.startY));
    }

    // pinch zoom when two pointers active
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
    if (pointers.current.size < 2 && modeRef.current === "pinch") {
      modeRef.current = "none";
    }
    if (modeRef.current === "drag") modeRef.current = "none";
  };

  /** ---------- Scale via corner handles (uniform) ---------- */
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

  /** ---------- Rotate via top handle ---------- */
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
    const next = clamp(Math.round(gesture.current.startRotation + deltaDeg), -45, 45);
    setRotationDeg(next);
  };
  const onRotateHandleUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (modeRef.current === "rotate") modeRef.current = "none";
  };

  /** ---------- Wheel zoom (desktop) ---------- */
  const onWheel = (e: React.WheelEvent) => {
    // Ctrl+wheel typically zooms the page; we’ll ignore Ctrl to be polite
    if (e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY; // positive => scroll down
    const next = clamp(scalePct + (delta > 0 ? -3 : 3), 10, 200);
    setScalePct(next);
  };

  /** ---------- Pricing (unchanged) ---------- */
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

  if (!chosenImage) {
    return (
      <>
        <Stepper current={2} />
        <div className="rounded-2xl border bg-white p-6 text-zinc-600 shadow-sm">
          No design selected. Go to{" "}
          <Link href="/generate" className="underline">
            Generate
          </Link>
          .
        </div>
      </>
    );
  }

  return (
    <>
      <Stepper current={2} />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Canvas card */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div
            ref={containerRef}
            onWheel={onWheel}
            className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl border bg-white touch-none"
          >
            {/* Mockup PNG that reacts to side + color */}
            <img
              src={teeSrc}
              alt={`T-shirt mockup (${color} ${side})`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="pointer-events-none absolute left-1/2 top-1/2 w-[90%] -translate-x-1/2 -translate-y-1/2 select-none"
            />

            {/* Safe area */}
            <div className="pointer-events-none absolute left-1/2 top-[34%] h-[45%] w-[65%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-black/10" />

            {/* Design wrapper (rotates & scales) */}
            <div
              className="absolute"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${designWidthPx}px`,
                height: `${designHeightPx}px`,
                transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                // Enable pointer interaction within the box
                touchAction: "none",
              }}
            >
              {/* actual design image */}
              <img
                src={chosenImage}
                alt="Design"
                onLoad={(e) => {
                  const i = e.currentTarget;
                  setImgRatio(i.naturalHeight / i.naturalWidth);
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

              {/* bounding box overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-zinc-400/50" />

              {/* corner scale handles (uniform scale from center) */}
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

              {/* rotate handle (top-center) */}
              <div
                onPointerDown={onRotateHandleDown}
                onPointerMove={onRotateHandleMove}
                onPointerUp={onRotateHandleUp}
                className="absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-6 cursor-grab rounded-full border border-white bg-black"
                title="Drag to rotate"
              />
            </div>
          </div>
        </div>

        {/* Control panel */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Adjust & Options</h2>

          {/* Sliders (still available) */}
          <div className="grid gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Scale</span>
                <span className="tabular-nums text-zinc-500">{scalePct}%</span>
              </div>
              <Slider
                value={[scalePct]}
                min={10}
                max={200}
                step={1}
                onValueChange={(v) => setScalePct(v[0] ?? scalePct)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Rotation</span>
                <span className="tabular-nums text-zinc-500">
                  {rotationDeg}°
                </span>
              </div>
              <Slider
                value={[rotationDeg]}
                min={-45}
                max={45}
                step={1}
                onValueChange={(v) => setRotationDeg(v[0] ?? rotationDeg)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Opacity</span>
                <span className="tabular-nums text-zinc-500">{opacity}%</span>
              </div>
              <Slider
                value={[opacity]}
                min={10}
                max={100}
                step={1}
                onValueChange={(v) => setOpacity(v[0] ?? opacity)}
              />
            </div>
          </div>

          {/* Segmented options */}
          <div className="mt-6 grid gap-4">
            {/* Side */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-sm text-zinc-600">Side</span>
              <div className="flex gap-2">
                {(["front", "back"] as Side[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      s === side
                        ? "bg-black text-white"
                        : "border bg-white hover:bg-zinc-50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-sm text-zinc-600">Color</span>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-zinc-50 ${
                      color === c ? "ring-2 ring-black" : ""
                    }`}
                    title={c}
                  >
                    <span
                      className="inline-block h-4 w-4 rounded-full border"
                      style={{
                        background:
                          c === "white" ? "#fff" : c === "black" ? "#111" : "#d7d9de",
                        borderColor: c === "white" ? "#e5e7eb" : "transparent",
                      }}
                    />
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-sm text-zinc-600">Size</span>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      size === s
                        ? "bg-black text-white"
                        : "border bg-white hover:bg-zinc-50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Material */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-sm text-zinc-600">Material</span>
              <div className="flex flex-wrap gap-2">
                {MATERIALS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMaterial(m)}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      material === m
                        ? "bg-black text-white"
                        : "border bg-white hover:bg-zinc-50"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-sm text-zinc-600">Quantity</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </Button>
                <span className="w-10 text-center tabular-nums">{qty}</span>
                <Button variant="outline" onClick={() => setQty((q) => q + 1)}>
                  +
                </Button>
              </div>
            </div>
          </div>

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
              <span className="text-sm text-zinc-600">Unit price</span>
              <span className="font-semibold">{gbp.format(unitPrice)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm text-zinc-600">Quantity</span>
              <span className="tabular-nums">{qty}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{gbp.format(totalPrice)}</span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-6 flex items-center justify-between">
            <Link href="/generate" className="text-sm text-zinc-600 underline">
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
                className="rounded-xl bg-black px-6 text-white hover:bg-zinc-900"
                onClick={() => {
                  alert(
                    [
                      `Side: ${side}`,
                      `Color: ${color}`,
                      `Size: ${size}`,
                      `Material: ${material}`,
                      `Qty: ${qty}`,
                      `Unit: ${gbp.format(unitPrice)}`,
                      `Total: ${gbp.format(totalPrice)}`,
                    ].join("\n")
                  );
                }}
              >
                Proceed to payment →
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}