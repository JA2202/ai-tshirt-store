// app/api/print-file/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

function parseDataUrl(dataUrl: string): { mime: string; buffer: ArrayBuffer } {
  // e.g. data:image/png;base64,AAAA...
  const match = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  const mime = match[1] || "application/octet-stream";
  const base64 = match[2];
  const bin = Buffer.from(base64, "base64");
  // Convert Node Buffer -> ArrayBuffer for Blob()
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return { mime, buffer: ab };
}

export async function POST(req: Request) {
  // 1) Read body safely (avoid "Unexpected end of JSON input")
  let body: any = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  const imageUrl = (body?.imageUrl as string | undefined)?.trim();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not set" },
      { status: 500 }
    );
  }

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  try {
    // 2) Load the source image -> ArrayBuffer + contentType
    let arrayBuffer: ArrayBuffer;
    let contentType = "image/png";

    if (imageUrl.startsWith("data:")) {
      const parsed = parseDataUrl(imageUrl);
      arrayBuffer = parsed.buffer;
      contentType = parsed.mime || "image/png";
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Failed to fetch image (${res.status}): ${txt.slice(0, 200)}` },
          { status: 400 }
        );
      }
      arrayBuffer = await res.arrayBuffer();
      contentType = res.headers.get("content-type") || "image/png";
    }

    // 3) Upload to Vercel Blob (public)
    const filename = `print/print_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.png`;

    const blobBody = new Blob([arrayBuffer], { type: contentType });

    const uploaded = await put(filename, blobBody, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // 4) Respond with the public URL the webhook will use
    return NextResponse.json({ url: uploaded.url });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}