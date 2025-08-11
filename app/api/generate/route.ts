// app/api/generate/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ImgSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
const ALLOWED_SIZES: readonly ImgSize[] = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "auto",
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt: string = body?.prompt;
    const countRaw = Number(body?.count ?? 6);
    const requestedSize: string = body?.size ?? "1024x1024";

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing on the server" },
        { status: 500 }
      );
    }

    // coerce to supported size and to the proper literal-union type
    const size: ImgSize = (ALLOWED_SIZES.includes(
      requestedSize as ImgSize
    )
      ? requestedSize
      : "1024x1024") as ImgSize;

    const count = Math.min(8, Math.max(1, Number.isFinite(countRaw) ? countRaw : 6));

    // Fire off 'count' generations in parallel
    const jobs = Array.from({ length: count }, async () => {
      const r = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size, // typed as ImgSize, acceptable to the SDK
      });

      const first = r.data?.[0];
      if (first?.url) return first.url;
      if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
      return null;
    });

    const results = await Promise.all(jobs);
    const images = results.filter((u): u is string => Boolean(u));

    if (images.length === 0) {
      return NextResponse.json({ error: "No images returned" }, { status: 502 });
    }

    return NextResponse.json({ images });
  } catch (err: any) {
    console.error(err);
    const message =
      err?.message || err?.toString?.() || "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}