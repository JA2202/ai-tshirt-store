"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignStore, Color, Material, Side } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/** ---------------- PRICING (demo, unchanged) ---------------- */
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
  black: 1,     // pretreatment on dark garments
  heather: 0.5, // special blend
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

/** ---------------- MOCKUP PNG MAP (edit paths if you use different names) ---------------- */
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
// Fallback if a specific file is missing — keep a generic tee here if you want
const TEE_FALLBACK = "/tee.png";

/** ---------------- PAGE ---------------- */
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

  // redirect back if no selected image
  useEffect(() => {
    if (!chosenImage) router.replace("/generate");
  }, [chosenImage, router]);

  // editor state (unchanged)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scalePct, setScalePct] = useState(60);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [imgRatio, setImgRatio] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, dx: 0, dy: 0 });

  // quantity for pricing
  const [qty, setQty] = useState<number>(1);

  // helpers
  const containerW = containerRef.current?.clientWidth ?? 0;
  const containerH = containerRef.current?.clientHeight ?? 0;

  const safeRect = useMemo(() => {
    const w = containerW, h = containerH;
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
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  const centerDesign = () => {
    if (!containerRef.current) return;
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

  // drag handlers (prevent native image drag)
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    drag.current.active = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = containerRef.current.getBoundingClientRect();
    drag.current.dx = e.clientX - rect.left - pos.x;
    drag.current.dy = e.clientY - rect.top - pos.y;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - drag.current.dx;
    const y = e.clientY - rect.top - drag.current.dy;
    setPos(clampCenterToSafe(x, y));
  };
  const onPointerUp = () => {
    drag.current.active = false;
  };

  // ------- PRICING (unchanged) -------
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

  // --------- PICK MOCKUP PNG BY SIDE + COLOR ----------
  const teeSrc = useMemo(() => {
    return (TEE_MAP[side] && TEE_MAP[side][color]) || TEE_FALLBACK;
  }, [side, color]);

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
            className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl border bg-white"
          >
            {/* >>> Mockup PNG that reacts to side + color <<< */}
            <img
              src={teeSrc}
              alt={`T-shirt mockup (${color} ${side})`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="pointer-events-none absolute left-1/2 top-1/2 w-[90%] -translate-x-1/2 -translate-y-1/2 select-none"
            />

            {/* Safe area */}
            <div className="pointer-events-none absolute left-1/2 top-[34%] h-[45%] w-[65%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-black/10" />

            {/* Design layer */}
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
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute cursor-move select-none pointer-events-auto"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${designWidthPx}px`,
                height: "auto",
                transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                opacity: opacity / 100,
                touchAction: "none",
              }}
            />
          </div>
        </div>

        {/* Control panel */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Adjust & Options</h2>

          {/* Sliders */}
          <div className="grid gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Scale</span>
                <span className="tabular-nums text-zinc-500">{scalePct}%</span>
              </div>
              <Slider
                value={[scalePct]}
                min={20}
                max={120}
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
                min={-30}
                max={30}
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

          {/* Pricing summary (unchanged) */}
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