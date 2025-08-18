// Edit page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignStore, Color, Material, Side } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Star, Info, X } from "lucide-react";

/* ---------- Pricing ---------- */
const COLORS: Color[] = ["white", "black", "navy"];
const SIZES = ["S", "M", "L", "XL", "XXL"];
const MATERIALS: Material[] = ["standard", "eco", "premium"];
const TYPES = ["unisex"] as const;
type ProductType = (typeof TYPES)[number];
/** Visual-only scale for the mockup behind the safe zone (does NOT affect safe zone). */
const TEE_VISIBLE_SCALE = 1.45;
/* Desktop offsets (unchanged) */
const TEE_OFFSET_X_PX = -10;
const TEE_OFFSET_Y_PX = 90;
/* Mobile-only offset to prevent the tee from sitting too low on phones */
const TEE_OFFSET_Y_PX_MOBILE = 50;

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

/* ---------- Size guide data ---------- */
const SIZE_GUIDE_IN = [
  { label: "S", length: "28", width: "18", sleeve: "15 ⅝" },
  { label: "M", length: "29", width: "20", sleeve: "17" },
  { label: "L", length: "30", width: "22", sleeve: "18 ½" },
  { label: "XL", length: "31", width: "24", sleeve: "20" },
  { label: "2XL", length: "32", width: "26", sleeve: "21 ½" },
];

const SIZE_GUIDE_CM = [
  { label: "S", length: "71", width: "45.7", sleeve: "39.7" },
  { label: "M", length: "73.7", width: "50.8", sleeve: "43.2" },
  { label: "L", length: "76.2", width: "56", sleeve: "47" },
  { label: "XL", length: "78.7", width: "61", sleeve: "50.8" },
  { label: "2XL", length: "81.3", width: "66", sleeve: "54.6" },
];

/**
 * SAFE ZONE CALIBRATION (Printful alignment)
 * Define the printable area as a 12x16" (3:4) box positioned relative to the tee mockup.
 * Values are fractions of the tee image width/height (after it's laid out in the editor).
 * Tweak ONLY these numbers per product/side to align visually with Printful.
 */
const SAFE_ZONE_PRESETS: Record<
  Side,
  { leftPctOfTee: number; topPctOfTee: number; widthPctOfTee: number }
> = {
  front: {
    leftPctOfTee: 0.19, // tweak
    topPctOfTee: 0.24, // tweak
    widthPctOfTee: 0.62, // tweak (height is locked to 4/3 of width)
  },
  back: {
    leftPctOfTee: 0.19, // tweak
    topPctOfTee: 0.26, // tweak
    widthPctOfTee: 0.62, // tweak
  },
};

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

/* ---------- Text layer helpers ---------- */
const TEXT_FONTS = [
  { label: "Impact", value: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
  { label: "Bebas Neue (fallback)", value: "'Bebas Neue', Impact, sans-serif" },
  { label: "Arial Black", value: "'Arial Black', Arial, sans-serif" },
  { label: "Montserrat (fallback)", value: "Montserrat, Arial, sans-serif" },
  { label: "Inter (UI default)", value: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
  { label: "Trebuchet", value: "'Trebuchet MS', Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

const TEXT_COLORS = [
  "#111111",
  "#ffffff",
  "#ff375f",
  "#007AFF",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#000000",
  "#6b7280",
  "#7c3aed",
];

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

  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [sizeGuideTab, setSizeGuideTab] = useState<"in" | "cm">("in");

  // observe container size to avoid window resize jumps
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [scalePct, setScalePct] = useState(60);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [imgRatio, setImgRatio] = useState(1);
  const [teeRatio, setTeeRatio] = useState(1);

  // pixel position (derived from normalized) + normalized position (0..1)
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [posN, setPosN] = useState({ nx: 0.5, ny: 0.5 });

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
  const [productType, setProductType] = useState<ProductType>("unisex");

  /* ---------- NEW: Text layer state ---------- */
  const [textEnabled, setTextEnabled] = useState(false);
  const [textHasFocus, setTextHasFocus] = useState(false);
  const [text, setText] = useState<string>("YOUR TEXT");
  const [textFont, setTextFont] = useState<string>(TEXT_FONTS[0].value);
  const [textColor, setTextColor] = useState<string>("#111111");
  const [textOpacity, setTextOpacity] = useState<number>(100);
  const [textScalePct, setTextScalePct] = useState<number>(60);
  const [textRotationDeg, setTextRotationDeg] = useState<number>(0);
  const [textPos, setTextPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [textPosN, setTextPosN] = useState<{ nx: number; ny: number }>({ nx: 0.5, ny: 0.5 });

  const textModeRef = useRef<GestureMode>("none");
  const textGesture = useRef({
    startX: 0,
    startY: 0,
    startScale: 60,
    startRotation: 0,
    startDist: 0,
    startAngle: 0,
  });

  /* ---------- Geometry ---------- */
  const containerW = containerSize.w;
  const containerH = containerSize.h;

  /** Runtime breakpoint: treat narrow canvases as “mobile” for tee offset only */
  const isMobile = containerW < 520;

  /**
   * Compute the tee mockup bounds inside the container.
   * Tee is rendered at 90% of container width, centered (matches your <img> logic for safe zone).
   */
  const teeBounds = useMemo(() => {
    const teeW = containerW * 0.9;
    const teeH = teeW * (teeRatio || 1);
    const teeX = (containerW - teeW) / 2;
    const teeY = (containerH - teeH) / 2;
    return { x: teeX, y: teeY, w: teeW, h: teeH };
  }, [containerW, containerH, teeRatio]);

  /**
   * SAFE RECT:
   * - If tee image has loaded, use calibrated 12x16 area positioned via SAFE_ZONE_PRESETS.
   * - Otherwise, fall back to your original overlay geometry so nothing jumps before load.
   */
  const safeRect = useMemo(() => {
    if (!teeLoaded || !containerW || !containerH) {
      const w = containerW || 0;
      const h = containerH || 0;
      return {
        x: 0.5 * w - 0.65 * w * 0.5,
        y: 0.34 * h - 0.45 * h * 0.5,
        w: 0.65 * w,
        h: 0.45 * h,
      };
    }

    const preset = SAFE_ZONE_PRESETS[side] || SAFE_ZONE_PRESETS.front;
    const { x: tX, y: tY, w: tW, h: tH } = teeBounds;

    // Desired 12:16 ratio (W:H = 3:4)
    const desiredW = tW * preset.widthPctOfTee;
    const desiredH = desiredW * (4 / 3);

    const srX = tX + preset.leftPctOfTee * tW;
    const srY = tY + preset.topPctOfTee * tH;
    let srW = desiredW;
    let srH = desiredH;

    // Clamp within tee image if needed
    if (srY + srH > tY + tH) {
      srH = Math.max(1, tY + tH - srY);
      srW = srH * (3 / 4);
    }
    if (srX + srW > tX + tW) {
      srW = Math.max(1, tX + tW - srX);
      srH = srW * (4 / 3);
      if (srY + srH > tY + tH) {
        srH = Math.max(1, tY + tH - srY);
        srW = srH * (3 / 4);
      }
    }

    return { x: srX, y: srY, w: srW, h: srH };
  }, [teeLoaded, containerW, containerH, side, teeBounds]);

  const designWidthPx = useMemo(() => {
    if (!containerW) return 0;
    const desired = Math.max(40, (scalePct / 100) * containerW * 0.8);
    return Math.min(desired, safeRect.w || desired);
  }, [containerW, scalePct, safeRect.w]);

  const designHeightPx = useMemo(
    () => Math.max(40, designWidthPx * imgRatio),
    [designWidthPx, imgRatio]
  );

  /* ---------- NEW: text box measured dimensions (SSR-safe) ---------- */
  const measureCanvas = useRef<HTMLCanvasElement | null>(null);
  const getCtx = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return null;
    if (!measureCanvas.current) {
      measureCanvas.current = document.createElement("canvas");
    }
    return measureCanvas.current.getContext("2d");
  };
  const baseTextSize = Math.max(12, Math.round((containerW || 320) * 0.08)); // ~8% width
  const textFontSizePx = Math.max(12, Math.round(baseTextSize * (textScalePct / 100)));

  const textDims = useMemo(() => {
    const ctx = getCtx();
    if (!ctx) return { w: 120, h: Math.round(textFontSizePx * 1.2) };
    ctx.font = `700 ${textFontSizePx}px ${textFont}`;
    const metrics = ctx.measureText(text || "YOUR TEXT");
    const w = Math.min(Math.max(40, Math.round(metrics.width + 12)), Math.round(safeRect.w));
    const h = Math.max(24, Math.round(textFontSizePx * 1.2));
    return { w, h };
  }, [text, textFont, textFontSizePx, safeRect.w]);

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

  const applySnapGeneric = (x: number, y: number, halfW: number, halfH: number) => {
    let sx = x;
    let sy = y;
    let showV: number | null = null;
    let showH: number | null = null;

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

  /* ---------- Rotated extents + clamping ---------- */
  const rotatedHalfExtents = (w: number, h: number, angleDeg: number) => {
    const c = Math.abs(Math.cos(rad(angleDeg)));
    const s = Math.abs(Math.sin(rad(angleDeg)));
    return {
      halfW: 0.5 * (c * w + s * h),
      halfH: 0.5 * (s * w + c * h),
    };
  };

  const clampUsingHalf = (x: number, y: number, halfW: number, halfH: number) => {
    if (halfW * 2 > safeRect.w || halfH * 2 > safeRect.h) {
      return { x: safeRect.x + safeRect.w / 2, y: safeRect.y + safeRect.h / 2 };
    }
    const minX = safeRect.x + halfW;
    const maxX = safeRect.x + safeRect.w - halfW;
    const minY = safeRect.y + halfH;
    const maxY = safeRect.y + safeRect.h;
    return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
  };

  const clampPosImage = (x: number, y: number, snap: boolean) => {
    const { halfW, halfH } = rotatedHalfExtents(designWidthPx, designHeightPx, rotationDeg);
    const base = clampUsingHalf(x, y, halfW, halfH);
    return snap ? applySnapGeneric(base.x, base.y, halfW, halfH) : base;
  };

  const clampPosText = (x: number, y: number, snap: boolean) => {
    const { halfW, halfH } = rotatedHalfExtents(textDims.w, textDims.h, textRotationDeg);
    const base = clampUsingHalf(x, y, halfW, halfH);
    return snap ? applySnapGeneric(base.x, base.y, halfW, halfH) : base;
  };

  // convert between px and normalized (0..1 inside safe rect)
  const toNorm = (x: number, y: number) => {
    const nx = safeRect.w ? clamp((x - safeRect.x) / safeRect.w, 0, 1) : 0.5;
    const ny = safeRect.h ? clamp((y - safeRect.y) / safeRect.h, 0, 1) : 0.5;
    return { nx, ny };
  };
  const fromNorm = (nx: number, ny: number) => ({
    x: safeRect.x + nx * safeRect.w,
    y: safeRect.y + ny * safeRect.h,
  });

  /* ---------- Position init / react to size changes (no recenter on resize) ---------- */
  useEffect(() => {
    // image
    const px = fromNorm(posN.nx, posN.ny);
    const p = clampPosImage(px.x, px.y, false);
    setPos(p);
    setPosN(toNorm(p.x, p.y));
    // text
    const tx = fromNorm(textPosN.nx, textPosN.ny);
    const tp = clampPosText(tx.x, tx.y, false);
    setTextPos(tp);
    setTextPosN(toNorm(tp.x, tp.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    safeRect.x,
    safeRect.y,
    safeRect.w,
    safeRect.h,
    designWidthPx,
    designHeightPx,
    rotationDeg,
    textDims.w,
    textDims.h,
    textRotationDeg,
  ]);

  const centerDesign = () => {
    const p = clampPosImage(safeRect.x + safeRect.w / 2, safeRect.y + safeRect.h / 2, false);
    setPos(p);
    setPosN(toNorm(p.x, p.y));
  };
  const centerText = () => {
    const p = clampPosText(safeRect.x + safeRect.w / 2, safeRect.y + safeRect.h / 2, false);
    setTextPos(p);
    setTextPosN(toNorm(p.x, p.y));
  };

  // mount: center both once (no window resize recenter)
  useEffect(() => {
    centerDesign();
    centerText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenImage]);

  /* ---------- Enforce max scale based on rotation + safeRect ---------- */
  const maxImageScalePct = useMemo(() => {
    if (!containerW) return 200;
    const k = (containerW * 0.8) / 100; // width per 1% scale
    const c = Math.abs(Math.cos(rad(rotationDeg)));
    const s = Math.abs(Math.sin(rad(rotationDeg)));
    const a = c + s * imgRatio;
    const b = s + c * imgRatio;
    if (!a || !b) return 200;
    const byW = safeRect.w / (k * a);
    const byH = safeRect.h / (k * b);
    return clamp(Math.floor(Math.min(byW, byH)), 10, 200);
  }, [containerW, rotationDeg, imgRatio, safeRect.w, safeRect.h]);

  useEffect(() => {
    // shrink image scale if rotation or size reduces capacity
    setScalePct((s) => clamp(s, 10, maxImageScalePct));
    // position might need clamping after scale cap
    setPos((p) => {
      const np = clampPosImage(p.x, p.y, false);
      setPosN(toNorm(np.x, np.y));
      return np;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxImageScalePct]);

  const maxTextScaleAbs = useMemo(() => {
    // based on current measured textDims (linear in scale), compute absolute max scale
    const { halfW, halfH } = rotatedHalfExtents(textDims.w, textDims.h, textRotationDeg);
    if (halfW * 2 === 0 || halfH * 2 === 0) return 300;
    // current rotated full sizes:
    const Wrot = halfW * 2;
    const Hrot = halfH * 2;
    const fW = safeRect.w / Wrot;
    const fH = safeRect.h / Hrot;
    const f = Math.min(fW, fH);
    const maxAbs = textScalePct * f;
    return clamp(Math.floor(maxAbs), 10, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textDims.w, textDims.h, textRotationDeg, safeRect.w, safeRect.h]);

  useEffect(() => {
    setTextScalePct((s) => clamp(s, 10, maxTextScaleAbs));
    setTextPos((p) => {
      const np = clampPosText(p.x, p.y, false);
      setTextPosN(toNorm(np.x, np.y));
      return np;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxTextScaleAbs]);

  /* ---------- Mockup src ---------- */
  const teeSrc = useMemo(() => {
    return (TEE_MAP[side] && TEE_MAP[side][color]) || TEE_FALLBACK;
  }, [side, color]);

  /* ---------- Pointer helpers ---------- */
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

  /* ---------- Image layer pointer logic ---------- */
  const onDesignPointerDown = (e: React.PointerEvent) => {
    setTextHasFocus(false);
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    modeRef.current = "drag";
    const p = getLocalXY(e);
    gesture.current.startX = p.x - pos.x;
    gesture.current.startY = p.y - pos.y;
    pointers.current.set(e.pointerId, p);
  };
  const onDesignPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, getLocalXY(e));
    if (modeRef.current === "drag") {
      const p = getLocalXY(e);
      const np = clampPosImage(p.x - gesture.current.startX, p.y - gesture.current.startY, true);
      setPos(np);
      setPosN(toNorm(np.x, np.y));
    }
    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values()).slice(0, 2);
      if (modeRef.current !== "pinch") {
        modeRef.current = "pinch";
        gesture.current.startDist = dist(a, b);
        gesture.current.startScale = scalePct;
      } else {
        const factor = dist(a, b) / Math.max(1, gesture.current.startDist);
        let next = clamp(Math.round(gesture.current.startScale * factor), 10, 200);
        next = Math.min(next, maxImageScalePct);
        setScalePct(next);
        setPos((p) => {
          const cp = clampPosImage(p.x, p.y, false);
          setPosN(toNorm(cp.x, cp.y));
          return cp;
        });
      }
    }
  };
  const onDesignPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && modeRef.current === "pinch") modeRef.current = "none";
    if (modeRef.current === "drag") modeRef.current = "none";
  };

  /* ---------- Image scale/rotate ---------- */
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
    let next = clamp(Math.round(gesture.current.startScale * f), 10, 200);
    next = Math.min(next, maxImageScalePct);
    setScalePct(next);
    setPos((pp) => {
      const cp = clampPosImage(pp.x, pp.y, false);
      setPosN(toNorm(cp.x, cp.y));
      return cp;
    });
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
    const nearest = Math.round(next / SNAP_ANGLE) * SNAP_ANGLE;
    if (Math.abs(nearest - next) <= MAGNET) next = nearest;
    next = clamp(Math.round(next), -45, 45);
    setRotationDeg(next);
    // rotation may reduce fit; cap scale & clamp pos
    setScalePct((s) => Math.min(s, maxImageScalePct));
    setPos((pp) => {
      const cp = clampPosImage(pp.x, pp.y, false);
      setPosN(toNorm(cp.x, cp.y));
      return cp;
    });
  };
  const onRotateHandleUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (modeRef.current === "rotate") modeRef.current = "none";
  };

  /* ---------- Text layer pointer logic ---------- */
  const onTextPointerDown = (e: React.PointerEvent) => {
    if (!textEnabled) return;
    setTextHasFocus(true);
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    textModeRef.current = "drag";
    const p = getLocalXY(e);
    textGesture.current.startX = p.x - textPos.x;
    textGesture.current.startY = p.y - textPos.y;
  };
  const onTextPointerMove = (e: React.PointerEvent) => {
    if (!textEnabled || textModeRef.current !== "drag") return;
    const p = getLocalXY(e);
    const np = clampPosText(p.x - textGesture.current.startX, p.y - textGesture.current.startY, true);
    setTextPos(np);
    setTextPosN(toNorm(np.x, np.y));
  };
  const onTextPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (textModeRef.current === "drag") textModeRef.current = "none";
  };

  const onTextScaleDown = (e: React.PointerEvent) => {
    if (!textEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    textModeRef.current = "scale";
    const p = getLocalXY(e);
    textGesture.current.startDist = dist({ x: textPos.x, y: textPos.y }, p);
    textGesture.current.startScale = textScalePct;
  };
  const onTextScaleMove = (e: React.PointerEvent) => {
    if (!textEnabled || textModeRef.current !== "scale") return;
    const p = getLocalXY(e);
    const f = dist({ x: textPos.x, y: textPos.y }, p) / Math.max(1, textGesture.current.startDist);
    let next = clamp(Math.round(textGesture.current.startScale * f), 10, 300);
    next = Math.min(next, maxTextScaleAbs);
    setTextScalePct(next);
    setTextPos((pp) => {
      const cp = clampPosText(pp.x, pp.y, false);
      setTextPosN(toNorm(cp.x, cp.y));
      return cp;
    });
  };
  const onTextScaleUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (textModeRef.current === "scale") textModeRef.current = "none";
  };

  const onTextRotateDown = (e: React.PointerEvent) => {
    if (!textEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    textModeRef.current = "rotate";
    const p = getLocalXY(e);
    textGesture.current.startAngle = angleTo({ x: textPos.x, y: textPos.y }, p);
    textGesture.current.startRotation = textRotationDeg;
  };
  const onTextRotateMove = (e: React.PointerEvent) => {
    if (!textEnabled || textModeRef.current !== "rotate") return;
    const p = getLocalXY(e);
    const a = angleTo({ x: textPos.x, y: textPos.y }, p);
    const deltaDeg = deg(a - textGesture.current.startAngle);
    let next = textGesture.current.startRotation + deltaDeg;
    const nearest = Math.round(next / 15) * 15;
    if (Math.abs(nearest - next) <= 4) next = nearest;
    next = clamp(Math.round(next), -45, 45);
    setTextRotationDeg(next);
    setTextScalePct((s) => Math.min(s, maxTextScaleAbs));
    setTextPos((pp) => {
      const cp = clampPosText(pp.x, pp.y, false);
      setTextPosN(toNorm(cp.x, cp.y));
      return cp;
    });
  };
  const onTextRotateUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (textModeRef.current === "rotate") textModeRef.current = "none";
  };

  /* ---------- Wheel zoom (image) ---------- */
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY;
    let next = clamp(scalePct + (delta > 0 ? -3 : 3), 10, 200);
    next = Math.min(next, maxImageScalePct);
    setScalePct(next);
    setPos((p) => {
      const cp = clampPosImage(p.x, p.y, false);
      setPosN(toNorm(cp.x, cp.y));
      return cp;
    });
  };

  /* ---------- Undo/Redo ---------- */
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
    setPosN(toNorm(s.x, s.y));
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

  const totalPrice = useMemo(() => +(unitPrice * Math.max(1, qty)).toFixed(2), [unitPrice, qty]);

  /* ---------- Download mockup JPG (unchanged) ---------- */
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
      const teeW = W * TEE_VISIBLE_SCALE;
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

      if (textEnabled && (text || "").trim().length > 0) {
        const baseFS = Math.max(12, Math.round(W * 0.08));
        const fs = Math.max(12, Math.round(baseFS * (textScalePct / 100)));
        ctx.save();
        ctx.translate(textPos.x, textPos.y);
        ctx.rotate(rad(textRotationDeg));
        ctx.globalAlpha = textOpacity / 100;
        ctx.font = `700 ${fs}px ${textFont}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = textColor;
        ctx.fillText(text, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

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

  /* ---------- Print PNG builder (unchanged) ---------- */
  async function buildPrintPNG(): Promise<string> {
    const OUT_W = 3600; // 12" * 300
    const OUT_H = 4800; // 16" * 300
    if (!containerRef.current) throw new Error("Editor not ready");
    if (!chosenImage) throw new Error("No design image loaded.");

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    // IMAGE LAYER
    const art = new Image();
    art.crossOrigin = "anonymous";
    art.src = chosenImage;
    await new Promise<void>((resolve) => {
      art.onload = () => resolve();
      art.onerror = () => resolve();
    });

    const imgNX = safeRect.w ? (pos.x - safeRect.x) / safeRect.w : 0.5;
    const imgNY = safeRect.h ? (pos.y - safeRect.y) / safeRect.h : 0.5;
    const imgFW = safeRect.w ? designWidthPx / safeRect.w : 0;
    const imgFH = safeRect.h ? designHeightPx / safeRect.h : 0;

    const imgPX = imgNX * OUT_W;
    const imgPY = imgNY * OUT_H;
    const imgPW = imgFW * OUT_W;
    const imgPH = imgFH * OUT_H;

    ctx.save();
    ctx.translate(imgPX, imgPY);
    ctx.rotate((Math.PI / 180) * rotationDeg);
    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(art, -imgPW / 2, -imgPH / 2, imgPW, imgPH);
    ctx.restore();
    ctx.globalAlpha = 1;

    // TEXT LAYER (optional)
    if (textEnabled && (text || "").trim().length > 0) {
      const txtNX = safeRect.w ? (textPos.x - safeRect.x) / safeRect.w : 0.5;
      const txtNY = safeRect.h ? (textPos.y - safeRect.y) / safeRect.h : 0.5;
      const txtPX = txtNX * OUT_W;
      const txtPY = txtNY * OUT_H;

      const printFontPx = Math.max(12, Math.round((textFontSizePx / (safeRect.h || 1)) * OUT_H));

      ctx.save();
      ctx.translate(txtPX, txtPY);
      ctx.rotate((Math.PI / 180) * textRotationDeg);
      ctx.globalAlpha = textOpacity / 100;
      ctx.font = `700 ${printFontPx}px ${textFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    return canvas.toDataURL("image/png");
  }

  /* ---------- Advanced: Save print file (URL) (unchanged) ---------- */
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

      const dataUrl = await buildPrintPNG();

      const res = await fetch("/api/print-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: dataUrl }),
      });

      if (!res.ok) {
        const txt = await res.text();
        setSavingPrint(false);
        alert(`Print file failed: ${txt}`);
        return;
      }

      const data = (await res.json()) as SaveResp;
      const url = data.url ?? data.pngUrl ?? data.publicUrl ?? data.file?.url ?? null;

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

  // ensure we have a print file before checkout (unchanged)
  async function ensurePrintFile(): Promise<string> {
    if (printFileUrl) return printFileUrl;
    if (!chosenImage) throw new Error("No design image loaded.");
    setSavingPrint(true);

    const dataUrl = await buildPrintPNG();

    const res = await fetch("/api/print-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: dataUrl }),
    });

    if (!res.ok) {
      const txt = await res.text();
      setSavingPrint(false);
      throw new Error(txt || "Failed to create print file");
    }

    const data = (await res.json()) as SaveResp;
    const url = data.url ?? data.pngUrl ?? data.publicUrl ?? data.file?.url ?? null;

    if (!url) {
      setSavingPrint(false);
      throw new Error("Print file created but no URL returned.");
    }

    setPrintFileUrl(url);
    setSavingPrint(false);
    return url;
  }

  /* ---------- Proceed to payment (Stripe) (unchanged) ---------- */
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
              /* Taller stage on desktop so enlarged tee fits without clipping */
              className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl border bg-white touch-none lg:aspect-[2/3]"
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
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none max-w-none"
                style={{
                  width: `${TEE_VISIBLE_SCALE * 100}%`,
                  left: `calc(50% + ${TEE_OFFSET_X_PX}px)`,
                  top: `calc(50% + ${(isMobile ? TEE_OFFSET_Y_PX_MOBILE : TEE_OFFSET_Y_PX)}px)`,
                }}
              />

              {/* SAFE ZONE OVERLAY — driven by calibrated safeRect */}
              <div
                className="pointer-events-none absolute rounded-md border-2 border-dashed border-white/90 mix-blend-difference"
                style={{
                  left: `${safeRect.x}px`,
                  top: `${safeRect.y}px`,
                  width: `${safeRect.w}px`,
                  height: `${safeRect.h}px`,
                }}
              />

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

              {/* IMAGE LAYER */}
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

              {/* TEXT LAYER (above image) */}
              {textEnabled && (text || "").trim().length > 0 && (
                <div
                  className="absolute"
                  style={{
                    left: `${textPos.x}px`,
                    top: `${textPos.y}px`,
                    width: `${textDims.w}px`,
                    height: `${textDims.h}px`,
                    transform: `translate(-50%, -50%) rotate(${textRotationDeg}deg)`,
                    touchAction: "none",
                  }}
                >
                  <div
                    onPointerDown={onTextPointerDown}
                    onPointerMove={onTextPointerMove}
                    onPointerUp={onTextPointerUp}
                    className="h-full w-full select-none cursor-move"
                    style={{
                      opacity: textOpacity / 100,
                      display: "grid",
                      placeItems: "center",
                      fontFamily: textFont,
                      fontWeight: 700,
                      fontSize: `${textFontSizePx}px`,
                      lineHeight: 1.2,
                      color: textColor,
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {text}
                  </div>

                  {/* selection ring */}
                  <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-zinc-400/50" />

                  {/* handles (only show when focused) */}
                  {textHasFocus && (
                    <>
                      {[
                        { k: "tl", style: "left-0 top-0 -translate-x-1/2 -translate-y-1/2" },
                        { k: "tr", style: "right-0 top-0 translate-x-1/2 -translate-y-1/2" },
                        { k: "bl", style: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2" },
                        { k: "br", style: "right-0 bottom-0 translate-x-1/2 translate-y-1/2" },
                      ].map((h) => (
                        <div
                          key={h.k}
                          onPointerDown={onTextScaleDown}
                          onPointerMove={onTextScaleMove}
                          onPointerUp={onTextScaleUp}
                          className={`absolute ${h.style} z-10 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-black`}
                          title="Drag to scale"
                        />
                      ))}
                      <div
                        onPointerDown={onTextRotateDown}
                        onPointerMove={onTextRotateMove}
                        onPointerUp={onTextRotateUp}
                        className="absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-6 cursor-grab rounded-full border border-white bg-black"
                        title="Drag to rotate"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controls / Right rail */}
          <div className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
            {/* Product title + reviews (static) */}
            <div className="mb-3">
              <h1 className="text-lg font-semibold">Classic Unisex Tee</h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                <span className="flex items-center">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.8} fill="currentColor" />
                  ))}
                </span>
                <span>5 Stars | 238 reviews</span>
              </div>
            </div>

            {/* Adjust & Options + Mockup JPG */}
            <div className="mb-6 rounded-xl border bg-zinc-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
                <h2 className="text-base font-medium">Adjust &amp; Options</h2>
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

              {/* Fine-tune (image) */}
              <details className="rounded-xl border bg-white p-3">
                <summary className="cursor-pointer select-none font-medium">Fine-tune (image)</summary>
                <div className="mt-4 grid gap-5">
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
                      onValueChange={(v) => setScalePct(clamp(v[0] ?? scalePct, 10, maxImageScalePct))}
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
              </details>
            </div>

            {/* Add Text Section */}
            <div className="mb-6 rounded-xl border bg-zinc-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-medium">Add Text</h2>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!textEnabled) centerText();
                    setTextEnabled((v) => !v);
                    setTextHasFocus(true);
                  }}
                >
                  {textEnabled ? "Remove" : "Add Text"}
                </Button>
              </div>

              {textEnabled && (
                <div className="grid gap-4">
                  {/* Content */}
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-sm">Content</span>
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Your text"
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Font */}
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-sm sm:w-20 sm:shrink-0">Font</span>
                    <select
                      value={textFont}
                      onChange={(e) => setTextFont(e.target.value)}
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    >
                      {TEXT_FONTS.map((f) => (
                        <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Color */}
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-sm sm:w-20 sm:shrink-0">Color</span>
                    <div className="flex flex-wrap gap-2">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setTextColor(c)}
                          className={`h-7 w-7 rounded-full border transition ${
                            textColor === c ? "ring-2 ring-[#007AFF]" : ""
                          }`}
                          style={{
                            background: c.toLowerCase(),
                            borderColor: c.toLowerCase() === "#ffffff" ? "#e5e7eb" : "transparent",
                          }}
                          title={c}
                        />
                      ))}
                      <input
                        type="text"
                        className="w-28 rounded-lg border bg-white px-2 py-1 text-xs"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Text fine-tune */}
                  <details className="rounded-xl border bg-white p-3">
                    <summary className="cursor-pointer select-none text-sm font-medium">
                      Text fine-tune
                    </summary>
                    <div className="mt-3 grid gap-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span>Scale</span>
                          <span className="tabular-nums">{textScalePct}%</span>
                        </div>
                        <Slider
                          value={[textScalePct]}
                          min={10}
                          max={300}
                          step={1}
                          onValueChange={(v) =>
                            setTextScalePct(clamp(v[0] ?? textScalePct, 10, maxTextScaleAbs))
                          }
                          className="[&_.bg-primary]:!bg-[#007AFF] [&_.border-primary]:!border-[#007AFF]"
                        />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span>Rotation</span>
                          <span className="tabular-nums">{textRotationDeg}°</span>
                        </div>
                        <Slider
                          value={[textRotationDeg]}
                          min={-45}
                          max={45}
                          step={1}
                          onValueChange={(v) => setTextRotationDeg(v[0] ?? textRotationDeg)}
                          className="[&_.bg-primary]:!bg-[#007AFF] [&_.border-primary]:!border-[#007AFF]"
                        />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span>Opacity</span>
                          <span className="tabular-nums">{textOpacity}%</span>
                        </div>
                        <Slider
                          value={[textOpacity]}
                          min={10}
                          max={100}
                          step={1}
                          onValueChange={(v) => setTextOpacity(v[0] ?? textOpacity)}
                          className="[&_.bg-primary]:!bg-[#007AFF] [&_.border-primary]:!border-[#007AFF]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTextScalePct(60);
                            setTextRotationDeg(0);
                            setTextOpacity(100);
                            centerText();
                          }}
                        >
                          Reset text
                        </Button>
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>

            {/* Type, Size, Material */}
            <div className="mb-6 rounded-xl border bg-zinc-50 p-4">
              <h2 className="mb-3 text-base font-medium">Type, Size, Material</h2>

              {/* Type */}
              <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Type</span>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setProductType(t)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        productType === t ? "border-2 border-[#007AFF] bg-white" : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Side */}
              <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Side</span>
                <div className="flex flex-wrap gap-2">
                  {(["front", "back"] as Side[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        s === side ? "border-2 border-[#007AFF] bg-white" : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
              <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm sm:w-20 sm:shrink-0">Size</span>
                <div className="flex flex-wrap items-center gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        size === s ? "border-2 border-[#007AFF] bg-white" : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}

                  {/* Size guide trigger (inline link) */}
                  <a
                    href="#size-guide"
                    onClick={(e) => {
                      e.preventDefault();
                      setSizeGuideOpen(true);
                    }}
                    className="ml-2 self-center text-xs underline text-[#007AFF] hover:text-[#005AD6] cursor-pointer"
                    aria-controls="size-guide-dialog"
                    aria-expanded={sizeGuideOpen ? "true" : "false"}
                  >
                    Size guide
                  </a>
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
                        material === m ? "border-2 border-[#007AFF] bg-white" : "border bg-white hover:bg-zinc-50"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Size & Quantity */}
            <div className="mb-6 rounded-xl border bg-zinc-50 p-4">
              <h2 className="mb-3 text-base font-medium">Quantity</h2>
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

            {/* Pricing summary + ETA/shipping info */}
            <div className="mb-6 rounded-xl border bg-zinc-50 p-4">
              <h2 className="mb-3 text-base font-medium">Price</h2>

              <div className="mb-3 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs text-zinc-700">
                <Info className="h-4 w-4 text-zinc-500" aria-hidden />
                <span className="mr-1">Estimated delivery to United Kingdom:</span>
                <span className="font-medium">4–6 days</span>
                <span className="mx-2">•</span>
                <span>Shipping starts at <span className="font-medium">£3.59</span></span>
              </div>

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

            {/* Size Guide Modal */}
            {sizeGuideOpen && (
              <div
                id="size-guide-dialog"
                className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"
                onClick={() => setSizeGuideOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-labelledby="size-guide-title"
              >
                <div
                  className="w-full max-w-2xl rounded-2xl border bg-white p-5 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-4 flex items-start justify-between">
                    <h3 id="size-guide-title" className="text-lg font-semibold">
                      Find Your Size
                    </h3>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-zinc-50"
                      onClick={() => setSizeGuideOpen(false)}
                      aria-label="Close size guide"
                    >
                      <X className="h-4 w-4" />
                      Close
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="mb-4 flex gap-2">
                    <button
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        sizeGuideTab === "in"
                          ? "border-[#007AFF] bg-[#007AFF] text-white"
                          : "bg-white hover:bg-zinc-50"
                      }`}
                      onClick={() => setSizeGuideTab("in")}
                      type="button"
                    >
                      Inches
                    </button>
                    <button
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        sizeGuideTab === "cm"
                          ? "border-[#007AFF] bg-[#007AFF] text-white"
                          : "bg-white hover:bg-zinc-50"
                      }`}
                      onClick={() => setSizeGuideTab("cm")}
                      type="button"
                    >
                      Centimetres
                    </button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left font-medium">Size Label</th>
                          <th className="py-2 text-left font-medium">Length</th>
                          <th className="py-2 text-left font-medium">Width</th>
                          <th className="py-2 text-left font-medium">Sleeve length</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sizeGuideTab === "in" ? SIZE_GUIDE_IN : SIZE_GUIDE_CM).map((r) => (
                          <tr key={`${sizeGuideTab}-${r.label}`} className="border-b last:border-0">
                            <td className="py-2">{r.label}</td>
                            <td className="py-2">{r.length}</td>
                            <td className="py-2">{r.width}</td>
                            <td className="py-2">{r.sleeve}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced (accordion) */}
            <details className="rounded-xl border bg-zinc-50 p-4">
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

            {/* Footer actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
              <Link href="/generate" className="text-sm underline">
                ← Back to Generate
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setScalePct((s) => clamp(60, 10, maxImageScalePct));
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
            <span className="text-sm">Total {gbp.format(totalPrice)}</span>
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