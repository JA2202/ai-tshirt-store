"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignStore } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type StyleKey =
  | "realistic" | "cartoon" | "anime" | "fine_line"
  | "minimal" | "vintage" | "graphic_logo" | "other";

const STYLES: { key: StyleKey; label: string; token: string }[] = [
  { key: "realistic", label: "Realistic", token: "photorealistic, natural lighting, high detail" },
  { key: "cartoon", label: "Cartoon", token: "bold outlines, flat colours, playful" },
  { key: "anime", label: "Anime", token: "anime style, cel shading, crisp linework" },
  { key: "fine_line", label: "Fine line", token: "minimal fine line art, single-colour, delicate lines" },
  { key: "minimal", label: "Minimal", token: "minimalist, clean negative space, simple forms" },
  { key: "vintage", label: "Vintage", token: "vintage, worn texture, retro print" },
  { key: "graphic_logo", label: "Graphic logo", token: "vector style, logo-ready, solid fills" },
  { key: "other", label: "Other", token: "" },
];

const PRESETS = [
  "minimal line-art animal logo",
  "retro wave sunset with palm trees",
  "bold mascot thunderbolt",
  "vintage skate badge",
  "geometric mountain emblem",
  "anime chibi character",
];

const SURPRISE = [
  "hand-drawn smiley with flowers",
  "geometric tiger head",
  "abstract paint splash stencil",
  "retro game pixel heart",
  "astronaut holding a coffee",
  "neon dragon silhouette",
  "dancing avocado with sunglasses",
"retro cassette tape with neon lightning",
"sleepy sloth sipping espresso",
"pixelated UFO abducting a slice of pizza",
"minimal wave with rising sun",
"geometric fox portrait",
"cyberpunk city skyline silhouette",
"tiny astronaut walking a balloon planet",
"vaporwave dolphin over grid sunset",
"handwritten 'ok but coffee first' sticker",
"samurai cat in kimono",
"origami crane constellation",
"vintage roller skates with sparkles",
"mushroom house in a teacup",
"skeleton hand peace sign, friendly style",
"happy cloud raining confetti",
"kawaii ramen bowl with chopsticks",
"meteor surfing penguin",
"neon palm tree glitch",
"mountain landscape inside triangle",
"sunflower smile on checkerboard",
"retro game controller blueprint",
"froggy DJ on vinyl turntable",
"thunderbolt with smiley face",
"galactic koi fish yin yang",
"tiny camper van under big moon",
"robot watering a plant",
"lava lamp dream swirl",
"polaroid of a beach dog",
"compass rose with waves",
"paper airplane shooting stars",
"bananas riding a skateboard",
"minimal yin yang cats",
"astronaut reading a book",
"404 not found road sign",
"glitch butterfly with pixels",
"lofi cat at window",
"boba tea galaxy",
"donut planet with sprinkles ring",
"synthwave grid mountain",
"wolf silhouette with forest double exposure",
"origami fox minimal line",
"cute cactus trio in pots",
"happy toast high five",
"soda can surfing wave",
"octopus holding balloons",
"vintage microphone lightning",
"astronaut riding rubber duck",
"minimal chess knight mark",
"steaming dumpling with smile",
"paper cut-out ocean layers",
"retro badge stay curious",
"globe with paper planes",
"dog astronaut paw print",
"cat loaf bakery logo",
"spicy chili with fire smile",
"rainbow gradient swirl heart",
"campfire with marshmallow swords",
"geometric hummingbird",
"mountain biker silhouette sunset",
"polite ghost saying boo please",
"potted monstera line art",
"origami whale with waves",
"neon lightning bolt pattern",
"retro motel sign road trip",
"corgi butt icon",
"sushi rocket ship",
"snail mail envelope racing",
"tiny wizard casting wifi",
"vintage cassette 'mixtape vol.1'",
"handpoke style snake and flowers",
"archery target with smile",
"sakura branch circle frame",
"camp badge adventure awaits",
"paper moon and ladder",
"chef cat tossing pizza",
"rainbow gradient jellyfish",
"owl reading at midnight",
"bicycle with flower basket",
"tea dragon in cup",
"glitch smiley face",
"retro map with pin",
"wind-up robot heart",
"pirate rubber duck",
"comfy croissant with beret",
"cassette tangled into heart",
"koala hanging from wifi signal",
"sunrise over desert dunes",
"jelly donut lifting weights",
"chill bear with beanie",
"camping under aurora",
"keyboard key 'ESC' running",
"minimal lightning inside circle",
"lotus flower geometric lines",
"happy skeleton skating",
"bonsai tree on wave",
"tiny dragon curled around pencil",
"gameboy style cat screen",
"astronaut planting smiley flag",
"bubble tea comet tail",
];

/* Showcase images present in /public/showcase */
const SHOWCASE_IMAGES = [
  "/showcase/1.png",
  "/showcase/2.png",
  "/showcase/3.png",
  "/showcase/4.png",
  "/showcase/5.png",
];

function Dots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="inline-block animate-bounce [animation-delay:-0.2s]">•</span>
      <span className="inline-block animate-bounce [animation-delay:-0.1s]">•</span>
      <span className="inline-block animate-bounce">•</span>
    </span>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const { prompt, setPrompt, images, setImages, chosenImage, setChosenImage } = useDesignStore();

  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number>(4);
  const [openModal, setOpenModal] = useState(false);

  // Modal options
  const [styleKey, setStyleKey] = useState<StyleKey>("realistic");
  const [customStyle, setCustomStyle] = useState("");
  const [transparent, setTransparent] = useState(false);
  const [refPreview, setRefPreview] = useState<string | null>(null);

  // Refine (folded by default)
  const [showRefine, setShowRefine] = useState(false);
  const [refine, setRefine] = useState("");

  // Upload your own design
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Showcase carousel auto-scroll (only if scrollable)
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
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

  const styleToken = STYLES.find((s) => s.key === styleKey)?.token || "";
  const finalStyle = styleKey === "other" ? customStyle.trim() : styleToken;

  function buildFinalPrompt(base: string) {
    const parts = [base.trim()];
    if (finalStyle) parts.push(finalStyle);
    if (transparent) parts.push("transparent background, sticker-style, no backdrop, no shadows");
    if (refPreview) parts.push("inspired by an uploaded reference image");
    parts.push("high contrast, sharp, t-shirt print ready");
    return parts.filter(Boolean).join(", ");
  }

  const onClickGenerate = () => {
    if (!prompt.trim()) return;
    setOpenModal(true);
  };

  const reallyGenerate = async () => {
    const finalPrompt = buildFinalPrompt(prompt);
    setOpenModal(false);
    setLoading(true);
    setChosenImage(null);
    setImages([]);
    setShowRefine(false);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt, count, size: "1024x1024", quality: "low" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate");
      setImages(data.images || []);
      setRefine(finalPrompt);
    } catch (e) {
      console.error(e);
      alert("Image generation failed. Check logs or credits.");
    } finally {
      setLoading(false);
    }
  };

  const onSurprise = () => {
    const idea = SURPRISE[Math.floor(Math.random() * SURPRISE.length)];
    setPrompt(idea);
  };

  // Upload → editor
  const onDesignUpload = (file: File | null) => {
    if (!file) return;
    const ok = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!ok.includes(file.type)) {
      alert("Please upload a PNG, JPG, WebP, or SVG.");
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
      alert("Please upload a PNG, JPG, or WebP.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRefPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const canContinue = Boolean(chosenImage);

  return (
    <div className="text-[#222222]">
      {/* Header (logo + back link) */}
      <header className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Threadlab home">
            {/* Put your real logo file in /public and update src if needed */}
            <img
              src="/logo.png"
              alt="Threadlab"
              className="h-7 w-auto"
              onError={(e) => {
                // fallback to text if the logo file isn't there yet
                const img = e.currentTarget;
                const span = document.createElement("span");
                span.textContent = "Threadlab";
                span.className = "text-lg font-semibold";
                img.replaceWith(span);
              }}
            />
          </Link>
          <a
            href="https://threadlabs.app"
            target="_blank"
            rel="noreferrer"
            className="text-[#007AFF] underline"
          >
            Back to threadlabs.app
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-4xl px-4 pt-6 pb-2 text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">Generate Your Original Design</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg">
          Create unique clothing and apparel by chatting with AI.
        </p>
        {/* Micro trust bar */}
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

      {/* App section (untouched logic/UI) */}
      <section className="mx-auto mt-4 w-full max-w-5xl px-3">
        <Stepper current={1} />

        {/* HERO: Prompt & quick actions */}
        <section className="mx-auto mt-2 w-full max-w-5xl">
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              {/* Input */}
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your design… (e.g. retro wave sunset with palm trees)"
                className="h-12 w-full rounded-xl text-base"
              />

              {/* Hidden file input (shared) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => onDesignUpload(e.target.files?.[0] ?? null)}
              />

              {/* Actions + Variants container */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* MOBILE layout */}
                <div className="flex w-full flex-col gap-2 sm:hidden">
                  <Button
                    onClick={onClickGenerate}
                    disabled={!prompt.trim()}
                    className="h-12 w-full rounded-xl bg-[#FF375F] px-5 text-white hover:bg-[#e03256] disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        Generating <Dots />
                      </span>
                    ) : (
                      "Generate"
                    )}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={onSurprise}
                      className="h-12 w-1/2 rounded-xl"
                    >
                      🎲 Surprise
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 w-1/2 rounded-xl"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload your design
                    </Button>
                  </div>
                </div>

                {/* DESKTOP layout */}
                <div className="hidden flex-wrap items-center gap-2 sm:flex">
                  <Button
                    onClick={onClickGenerate}
                    disabled={!prompt.trim()}
                    className="h-12 rounded-xl bg-[#FF375F] px-5 text-white hover:bg-[#e03256] disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        Generating <Dots />
                      </span>
                    ) : (
                      "Generate"
                    )}
                  </Button>
                  <Button variant="outline" onClick={onSurprise} className="h-12 rounded-xl">
                    🎲 Surprise
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload your design
                  </Button>
                </div>

                {/* Variants */}
                <div className="flex items-center gap-2">
                  <span className="text-sm">Variants</span>
                  <div className="flex gap-1.5">
                    {[2, 4, 6, 8].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCount(n)}
                        className={`rounded-full px-3 py-1.5 text-sm transition ${
                          count === n
                            ? "bg-black text-white"
                            : "bg-zinc-100 hover:bg-zinc-200"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preset chips — horizontal scroll on small screens */}
              <div className="-mx-1 mt-1 overflow-x-auto">
                <div className="flex min-w-full items-center gap-2 px-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPrompt(prompt ? `${prompt}, ${p}` : p)}
                      className="whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RESULTS */}
        <section className="mx-auto mt-5 w-full max-w-5xl">
          {loading && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className="aspect-square w-full animate-pulse rounded-xl bg-zinc-100" />
                ))}
              </div>
              <div className="mt-3 text-sm">Generating images <Dots /></div>
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
                    <img
                      src={url}
                      alt={`generated ${idx + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-xl ring-inset transition group-hover:ring-2 group-hover:ring-zinc-300" />
                  </button>
                ))}
              </div>

              {/* Refine & Continue */}
              <div className="mt-4 rounded-xl border bg-zinc-50 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">Want tweaks? Adjust the prompt and regenerate.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowRefine((s) => !s)}>
                      {showRefine ? "Hide changes" : "Make changes"}
                    </Button>
                    <Button
                      disabled={!canContinue}
                      onClick={() => router.push("/edit")}
                      className="rounded-xl bg-black text-white hover:bg-zinc-900 disabled:opacity-40"
                    >
                      Continue to Editor →
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
                    <Button
                      onClick={async () => {
                        setPrompt(refine);
                        setLoading(true);
                        setChosenImage(null);
                        setImages([]);
                        try {
                          const res = await fetch("/api/generate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              prompt: refine,
                              count,
                              size: "1024x1024",
                              quality: "low",
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || "Failed to generate");
                          setImages(data.images || []);
                        } catch (e) {
                          console.error(e);
                          alert("Image generation failed.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="h-11"
                    >
                      Regenerate with changes
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </section>

      {/* Showcase Carousel */}
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
          {SHOWCASE_IMAGES.map((src, i) => (
            <div key={`${src}-${i}`} className="shrink-0">
              <img
                src={src}
                alt={`showcase ${i + 1}`}
                loading="lazy"
                className="h-48 w-48 rounded-xl object-cover sm:h-56 sm:w-56"
                onError={(e) => (e.currentTarget.style.display = "none")} // hide any missing file gracefully
              />
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="font-semibold">Threadlab</span>
            <p className="mt-1 text-sm">
              Create, customize, and wear your ideas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:justify-end">
            <a href="https://threadlabs.app" className="text-[#007AFF] underline" target="_blank" rel="noreferrer">
              Sizing & Materials
            </a>
            <a href="https://threadlabs.app" className="text-[#007AFF] underline" target="_blank" rel="noreferrer">
              Shipping & Returns
            </a>
            <a href="https://threadlabs.app" className="text-[#007AFF] underline" target="_blank" rel="noreferrer">
              Contact
            </a>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 text-xs">
          © {new Date().getFullYear()} Threadlab. All rights reserved.
        </div>
      </footer>

      {/* MODAL: Style / Transparent / Reference */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="w-[96vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Style & options</DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            <div className="mb-2 text-sm">What type of style?</div>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStyleKey(s.key)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    styleKey === s.key ? "bg-black text-white" : "border bg-white hover:bg-zinc-50"
                  }`}
                >
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

          <div className="mt-4 flex items-center gap-2">
            <input
              id="transparent-bg"
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="transparent-bg" className="text-sm">
              Transparent background
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm">Upload reference (optional)</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onRefFile(e.target.files?.[0] ?? null)}
            />
            {refPreview && (
              <div className="mt-2">
                <img
                  src={refPreview}
                  alt="Reference"
                  className="h-24 w-24 rounded border object-cover"
                />
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenModal(false)}>
              Cancel
            </Button>
            <Button onClick={reallyGenerate} className="bg-[#FF375F] text-white hover:bg-[#e03256]">
              Apply & Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}