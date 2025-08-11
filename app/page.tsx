"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Use a hosted tee mockup so you don't need local assets yet
const TEE_URL = "tee.png"; // swap to "/tee.png" later if you add one

type Side = "front" | "back";

export default function Home() {
  // generation + upload
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string>(""); // AI or uploaded image
  const [loading, setLoading] = useState(false);

  // keep track of the current uploaded blob URL so we can revoke it on reset/replace
  const uploadedObjectUrlRef = useRef<string | null>(null);

  // editor state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState<Side>("front");
  const [scalePct, setScalePct] = useState(60); // % of container width (pre-clamped)
  const [rotationDeg, setRotationDeg] = useState(0);
  const [imgRatio, setImgRatio] = useState(1); // height/width of the design

  const [pos, setPos] = useState({ x: 0, y: 0 }); // center position in container px
  const drag = useRef({ active: false, dx: 0, dy: 0 });

  // --- helpers ---
  const containerW = containerRef.current?.clientWidth ?? 0;
  const containerH = containerRef.current?.clientHeight ?? 0;

  const safeRect = useMemo(() => {
    // Same geometry as the dashed outline
    const w = containerW,
      h = containerH;
    return {
      x: 0.5 * w - 0.65 * w * 0.5,
      y: 0.34 * h - 0.45 * h * 0.5,
      w: 0.65 * w,
      h: 0.45 * h,
    };
  }, [containerW, containerH]);

  // width of the design in px, clamped so it can't exceed safe area width
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
    // If design is bigger than safe area (shouldn't be now), stick to center
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

  // Recenter on new image or resize
  useEffect(() => {
    centerDesign();
    const onResize = () => centerDesign();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // When scale changes, ensure the center still sits inside the safe rect
  useEffect(() => {
    setPos((p) => clampCenterToSafe(p.x, p.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designWidthPx, designHeightPx]);

  // --- AI generation ---
  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    // if we previously had an uploaded blob URL, revoke it (we're replacing the image)
    if (uploadedObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedObjectUrlRef.current);
      uploadedObjectUrlRef.current = null;
    }
    setImageUrl("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generation failed");
      setImageUrl(data.imageUrl); // likely a data URL; safe to keep
    } catch (e) {
      console.error(e);
      alert("Image generation failed. Check your API key and logs.");
    } finally {
      setLoading(false);
    }
  };

  // --- upload support ---
  const onUpload = (f?: File) => {
    if (!f) return;
    // Revoke previous upload URL if any
    if (uploadedObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedObjectUrlRef.current);
      uploadedObjectUrlRef.current = null;
    }
    const url = URL.createObjectURL(f);
    uploadedObjectUrlRef.current = url;
    setImageUrl(url);
  };

  // --- full reset: clear image + editor state + revoke blob URL ---
  const handleReset = () => {
    // clean up uploaded blob URL if present
    if (uploadedObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedObjectUrlRef.current);
      uploadedObjectUrlRef.current = null;
    }
    setImageUrl("");         // remove the image from the canvas
    setScalePct(60);
    setRotationDeg(0);
    setImgRatio(1);
    centerDesign();          // re-center the (now-empty) design position
    // (keep prompt so you can quickly re-generate; clear it if you prefer)
    // setPrompt("");
  };

  // --- pointer handlers for drag (with native drag suppressed) ---
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); // stop text selection & native drag
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

  // --- placement JSON (normalized to the safe area) ---
  function getPlacementJSON() {
    const norm = {
      side,
      // normalize center within safe rect 0..1
      x: (pos.x - safeRect.x) / safeRect.w,
      y: (pos.y - safeRect.y) / safeRect.h,
      widthPct: designWidthPx / safeRect.w, // fraction of safe area width
      rotationDeg,
      imageUrl,
      aspectRatio: imgRatio,
    };
    return norm;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-semibold">AI T-Shirt Customizer</h1>
        <p className="text-sm text-gray-500">
          Drag/scale/rotate inside the dashed safe area. Toggle front/back, or upload your own art.
        </p>
      </div>

      {/* Controls */}
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your design…"
            className="w-full max-w-xl rounded-lg border px-4 py-2"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            {loading ? "Generating…" : "Generate"}
          </button>

          {/* Upload */}
          <label className="rounded-lg border px-3 py-2 cursor-pointer">
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] || undefined)}
            />
          </label>

          {/* Side toggle */}
          <button
            className="rounded-lg border px-3 py-2"
            onClick={() => setSide((s) => (s === "front" ? "back" : "front"))}
            title="Switch shirt side"
          >
            {side === "front" ? "Switch to Back" : "Switch to Front"}
          </button>

          {/* Reset now fully clears image + state */}
          <button
            onClick={handleReset}
            className="rounded-lg border px-3 py-2"
            title="Clear the current image and reset controls"
          >
            Reset / Clear
          </button>

          {/* Placement JSON */}
          <button
            className="rounded-lg border px-3 py-2"
            onClick={async () => {
              const json = JSON.stringify(getPlacementJSON(), null, 2);
              console.log("PLACEMENT", json);
              try {
                await navigator.clipboard.writeText(json);
                alert("Placement JSON copied to clipboard (also logged to console).");
              } catch {
                alert("Placement JSON logged to console.");
              }
            }}
          >
            Log placement JSON
          </button>
        </div>

        {/* Sliders */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3">
            <span className="w-24 text-sm text-gray-600">Scale</span>
            <input
              type="range"
              min={20}
              max={120}
              value={scalePct}
              onChange={(e) => setScalePct(parseInt(e.target.value))}
              className="w-full"
            />
            <span className="w-10 text-right text-sm text-gray-600">
              {scalePct}%
            </span>
          </label>

          <label className="flex items-center gap-3">
            <span className="w-24 text-sm text-gray-600">Rotation</span>
            <input
              type="range"
              min={-30}
              max={30}
              value={rotationDeg}
              onChange={(e) => setRotationDeg(parseInt(e.target.value))}
              className="w-full"
            />
            <span className="w-10 text-right text-sm text-gray-600">
              {rotationDeg}°
            </span>
          </label>
        </div>
      </div>

      {/* Studio */}
      <div className="mx-auto mt-6 max-w-5xl px-4">
        <div
          ref={containerRef}
          className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-sm"
        >
          {/* Shirt mockup */}
          <img
            src={TEE_URL}
            alt={`T-shirt mockup (${side})`}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[90%] -translate-x-1/2 -translate-y-1/2 select-none [-webkit-user-drag:none]"
          />

          {/* Safe area (visual) */}
          <div className="pointer-events-none absolute left-1/2 top-[34%] h-[45%] w-[65%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-black/10" />

          {/* Design layer */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Design"
              onLoad={(e) => {
                const i = e.currentTarget;
                setImgRatio(i.naturalHeight / i.naturalWidth);
                centerDesign();
              }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()} // stop native ghost drag
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute cursor-move select-none pointer-events-auto [-webkit-user-drag:none]"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${designWidthPx}px`,
                height: "auto",
                transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                touchAction: "none", // stop touch panning while dragging
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}