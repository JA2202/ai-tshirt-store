import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024", // good for previews
      // response_format: "url", // default; leave as-is, but we'll handle b64 too
    });

    const first = result.data?.[0];
    if (!first) {
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    let imageUrl: string | undefined;
    if (first.url) {
      imageUrl = first.url;
    } else if (first.b64_json) {
      imageUrl = `data:image/png;base64,${first.b64_json}`;
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "Empty image payload" }, { status: 502 });
    }

    return NextResponse.json({ imageUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Image generation failed" },
      { status: 500 }
    );
  }
}