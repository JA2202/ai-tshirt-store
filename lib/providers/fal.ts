// lib/providers/fal.ts
import { fal } from "@fal-ai/client";

// Configure fal once if the key exists
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

// ---------- Narrow response shapes (no `any`) ----------
type Imagen4ImageItem = { url?: string };
type Imagen4FastData = { images?: Imagen4ImageItem[] };
type Imagen4FastResponse = { data?: Imagen4FastData };

type BiRefNetImage = { url?: string };
type BiRefNetData = { image?: BiRefNetImage };
type BiRefNetResponse = { data?: BiRefNetData };

// Gemini Edit response shapes
type GeminiEditImageItem = { url?: string };
type GeminiEditData = { images?: GeminiEditImageItem[] };
type GeminiEditResponse = { data?: GeminiEditData };

// ---------- Small helpers to safely inspect unknowns ----------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isImagen4FastResponse(v: unknown): v is Imagen4FastResponse {
  if (!isRecord(v)) return false;
  const d = v.data;
  if (d !== undefined && !isRecord(d)) return false;
  const imgs = (d as Record<string, unknown> | undefined)?.images;
  if (imgs === undefined) return true;
  return Array.isArray(imgs) && imgs.every((it) => isRecord(it));
}

function isBiRefNetResponse(v: unknown): v is BiRefNetResponse {
  if (!isRecord(v)) return false;
  const d = v.data;
  if (d !== undefined && !isRecord(d)) return false;
  const img = (d as Record<string, unknown> | undefined)?.image;
  return img === undefined || isRecord(img);
}

function isGeminiEditResponse(v: unknown): v is GeminiEditResponse {
  if (!isRecord(v)) return false;
  const d = v.data;
  if (d !== undefined && !isRecord(d)) return false;
  const imgs = (d as Record<string, unknown> | undefined)?.images;
  if (imgs === undefined) return true;
  return Array.isArray(imgs) && imgs.every((it) => isRecord(it));
}

// Extract HTTP-ish status from unknown error objects without `any`
function getStatusFromUnknown(err: unknown): number | undefined {
  if (!isRecord(err)) return undefined;
  const direct = err.status;
  if (typeof direct === "number") return direct;
  const resp = err.response;
  if (isRecord(resp) && typeof resp.status === "number") return resp.status;
  return undefined;
}

// Try to pull a message from common fal-style error shapes (no `any`)
function getMessageFromUnknown(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  if (isRecord(err)) {
    const maybeMsg = err.message;
    if (typeof maybeMsg === "string") return maybeMsg;

    const resp = err.response;
    if (isRecord(resp)) {
      const data = resp.data;
      if (isRecord(data)) {
        const topMsg = data.message;
        if (typeof topMsg === "string") return topMsg;

        const innerErr = data.error;
        if (isRecord(innerErr) && typeof innerErr.message === "string") {
          return innerErr.message;
        }
      }
    }
  }
  return "";
}

/**
 * Generate images with fal-ai/imagen4/preview/fast ($0.02/image).
 * Returns public file URLs from fal's storage.
 */
export async function falGenerateImagen4Fast(
  params: FalImageGenParams
): Promise<string[]> {
  if (!FAL_CONFIGURED) throw new Error("FAL_KEY is not configured");
  const { prompt, numImages, aspectRatio = "1:1", seed } = params;

  const raw = await fal.subscribe("fal-ai/imagen4/preview/fast", {
    input: {
      prompt,
      num_images: Math.max(1, Math.min(4, numImages)),
      aspect_ratio: aspectRatio,
      ...(typeof seed === "number" ? { seed } : {}),
    },
    logs: false,
  });

  const result: unknown = raw;
  if (!isImagen4FastResponse(result)) {
    throw new Error("Unexpected response from fal imagen4/preview/fast");
  }

  const files = result.data?.images ?? [];
  const urls = files
    .map((f) => (typeof f.url === "string" ? f.url : null))
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

  const raw = await fal.subscribe("fal-ai/birefnet/v2", {
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

  const result: unknown = raw;
  if (!isBiRefNetResponse(result)) {
    throw new Error("Unexpected response from fal birefnet/v2");
  }

  const outUrl = result.data?.image?.url;
  if (typeof outUrl !== "string" || outUrl.length === 0) {
    throw new Error("BiRefNet: no image url returned");
  }
  return outUrl;
}

/**
 * Reference-image editing with fal-ai/gemini-25-flash-image/edit.
 * NOTE: FAL expects `image_urls: string[]` (plural). We request PNG outputs.
 * We accept optional params for compatibility with callers but only pass
 * supported fields to the API.
 */
export async function falGeminiEdit(params: {
  imageUrl: string;
  prompt: string;
  numImages: number; // 1..4
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9" | "9:16"; // accepted but NOT sent
  imageStrength?: number; // accepted but NOT sent
}): Promise<string[]> {
  if (!FAL_CONFIGURED) throw new Error("FAL_KEY is not configured");
  const { imageUrl, prompt, numImages } = params;

  try {
    const raw = await fal.subscribe("fal-ai/gemini-25-flash-image/edit", {
      input: {
        image_urls: [imageUrl], // <-- correct shape
        prompt,
        num_images: Math.max(1, Math.min(4, numImages)),
        output_format: "png",
        // DO NOT send aspect_ratio or image_strength: not supported by this endpoint
      },
      logs: false,
    });

    const result: unknown = raw;
    if (!isGeminiEditResponse(result)) {
      throw new Error("Unexpected response from fal gemini-25-flash-image/edit");
    }
    const files = result.data?.images ?? [];
    const urls = files
      .map((f) => (typeof f.url === "string" ? f.url : null))
      .filter((u): u is string => Boolean(u));

    if (urls.length === 0) throw new Error("No images returned (fal gemini edit)");
    return urls;
  } catch (err: unknown) {
    const status = getStatusFromUnknown(err);
    const msg = getMessageFromUnknown(err);

    // Surface safety/content checker blocks with a clear message
    if (status === 422 || /content checker|flagged|policy|unsafe/i.test(msg)) {
      throw new Error(
        msg || "The request was blocked by a safety/content checker."
      );
    }

    // Fallback
    if (msg) throw new Error(msg);
    throw new Error("fal gemini edit failed");
  }
}