"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDesignStore } from "@/lib/store";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
];

export default function GeneratePage() {
  const router = useRouter();
  const { prompt, setPrompt, images, setImages, chosenImage, setChosenImage } =
    useDesignStore();

  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number>(6);

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setChosenImage(null);
    setImages([]);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count, size: "1024x1024" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate");
      setImages(data.images || []);
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

  const canContinue = Boolean(chosenImage);

  return (
    <>
      <Stepper current={1} />

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        {/* Hero / Prompt row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your design… (e.g. retro wave sunset with palm trees)"
            className="h-12 w-full rounded-xl text-base"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={onGenerate}
              disabled={loading || !prompt.trim()}
              className="h-12 rounded-xl bg-black px-5 text-white hover:bg-zinc-900 disabled:opacity-50"
            >
              {loading ? "Generating…" : "Generate"}
            </Button>
            <Button
              variant="outline"
              onClick={onSurprise}
              className="h-12 rounded-xl"
              title="Surprise me"
            >
              🎲 Surprise
            </Button>
          </div>
        </div>

        {/* Presets / Variants count */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPrompt(prompt ? `${prompt}, ${p}` : p)}
              className="rounded-full border px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50"
              title="Add this style to your prompt"
            >
              {p}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-zinc-600">Variants</span>
            {[2, 4, 6, 8].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`rounded-full px-3 py-1.5 transition ${
                  count === n
                    ? "bg-black text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mt-6">
        {loading && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-600 shadow-sm">
            Generating images…
          </div>
        )}

        {!loading && images.length > 0 && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
                  {chosenImage === url && (
                    <div className="pointer-events-none absolute inset-0 rounded-xl border-[3px] border-black/70" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={onGenerate}>
                Generate more
              </Button>
              <Button
                disabled={!canContinue}
                onClick={() => router.push("/edit")}
                className="rounded-xl bg-black px-6 text-white hover:bg-zinc-900 disabled:opacity-40"
              >
                Continue to Editor →
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}