// app/api/generate/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Strict literal unions
type ImgSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
type ImgQuality = "low" | "medium" | "high";

const ALLOWED_SIZES: readonly ImgSize[] = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "auto",
];
const ALLOWED_QUALITIES: readonly ImgQuality[] = ["low", "medium", "high"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<{
      prompt: string;
      count: number;
      size: ImgSize | string;
      quality: ImgQuality | string;
    }>;

    const prompt = body?.prompt;
    const countRaw = Number(body?.count ?? 6);
    const requestedSize = (body?.size ?? "1024x1024") as string;
    const requestedQuality = (body?.quality ?? "low") as string; // cheap default

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing on the server" },
        { status: 500 }
      );
    }

    const size: ImgSize = (ALLOWED_SIZES.includes(requestedSize as ImgSize)
      ? requestedSize
      : "1024x1024") as ImgSize;

    const quality: ImgQuality = (ALLOWED_QUALITIES.includes(
      requestedQuality as ImgQuality
    )
      ? requestedQuality
      : "low") as ImgQuality;

    const n = Math.min(8, Math.max(1, Number.isFinite(countRaw) ? countRaw : 6));

    const r = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
      quality, // "low" | "medium" | "high"
      n,       // ask for n variants in one call
      // background: "transparent", // uncomment if you want transparent PNGs
    });

    const images =
      r.data
        ?.map((d) => (d.url ? d.url : d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter((u): u is string => Boolean(u)) ?? [];

    if (images.length === 0) {
      return NextResponse.json({ error: "No images returned" }, { status: 502 });
    }

    return NextResponse.json({ images });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}