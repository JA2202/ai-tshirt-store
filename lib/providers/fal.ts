// lib/providers/fal.ts
import { fal } from "@fal-ai/client";

const FAL_CONFIGURED = (() => {
  const key = process.env.FAL_KEY;
  if (key) fal.config({ credentials: key });
  return Boolean(key);
})();

export type FalImageGenParams = {
  prompt: string;
  numImages: number; // 1..4
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
  seed?: number;
};

/**
 * Generate images with fal-ai/imagen4/preview/fast ($0.02/image).
 * Returns public file URLs from fal's storage.
 */
export async function falGenerateImagen4Fast(
  params: FalImageGenParams
): Promise<string[]> {
  if (!FAL_CONFIGURED) throw new Error("FAL_KEY is not configured");
  const { prompt, numImages, aspectRatio = "1:1", seed } = params;

  const result = await fal.subscribe("fal-ai/imagen4/preview/fast", {
    input: {
      prompt,
      num_images: Math.max(1, Math.min(4, numImages)),
      aspect_ratio: aspectRatio,
      ...(typeof seed === "number" ? { seed } : {}),
    },
    logs: false,
  });

  const files: Array<{ url?: string }> | undefined = (result as any)?.data?.images;
  const urls = (files ?? [])
    .map((f) => (typeof f?.url === "string" ? f.url : null))
    .filter((u): u is string => Boolean(u));

  return urls;
}

/**
 * Background removal with fal-ai/birefnet/v2.
 * Input is a public image URL (e.g., your Blob URL).
 * Returns a fal-hosted transparent PNG URL.
 */
export async function falRemoveBackground(imageUrl: string): Promise<string> {
  if (!FAL_CONFIGURED) throw new Error("FAL_KEY is not configured");

  const model =
    process.env.FAL_BIREFNET_MODEL ||
    "Matting"; // "Matting" | "Portrait" | "General Use (Light)" | "General Use (Heavy)"
  const operating_resolution =
    process.env.FAL_OPERATING_RESOLUTION || "1024x1024"; // or "2048x2048"

  const result = await fal.subscribe("fal-ai/birefnet/v2", {
    input: {
      image_url: imageUrl,
      model,
      operating_resolution,
      output_format: "png",
      refine_foreground: true,
      output_mask: false,
    },
    logs: false,
  });

  const outUrl: string | undefined = (result as any)?.data?.image?.url;
  if (!outUrl) throw new Error("BiRefNet: no image url returned");
  return outUrl;
}