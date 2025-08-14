// app/api/print-file/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// app/api/print-file/route.ts
const OUT_W = 3600; // 12" * 300 DPI
const OUT_H = 4800; // 16" * 300 DPI

export const runtime = "nodejs";          // we use Buffer/Blob on Node
export const dynamic = "force-dynamic";   // always run server-side

// ---- Types for the request body (avoid `any`) ----
type PrintFileBody = {
  imageUrl?: string;
};

function toPrintFileBody(x: unknown): PrintFileBody {
  if (x && typeof x === "object") {
    const rec = x as Record<string, unknown>;
    if (typeof rec.imageUrl === "string") {
      return { imageUrl: rec.imageUrl };
    }
  }
  return {};
}

// Optional CORS/preflight support
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: ArrayBuffer } {
  // e.g. data:image/png;base64,AAAA...
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error("Invalid data URL");
  const mime = m[1] || "application/octet-stream";
  const bin = Buffer.from(m[2], "base64");
  // Convert Node Buffer -> ArrayBuffer for Blob()
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return { mime, buffer: ab };
}

export async function POST(req: Request) {
  // Safely read JSON (avoid "Unexpected end of JSON input") without `any`
  let body: PrintFileBody = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const parsed: unknown = await req.json();
      body = toPrintFileBody(parsed);
    }
  } catch {
    body = {};
  }

  const imageUrl = body.imageUrl?.trim();

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
    // Get the image as ArrayBuffer + contentType
    let arrayBuffer: ArrayBuffer;
    let contentType = "image/png";

    if (imageUrl.startsWith("data:")) {
      const parsed = parseDataUrl(imageUrl);
      arrayBuffer = parsed.buffer;
      contentType = parsed.mime || "image/png";
    } else {
      const r = await fetch(imageUrl);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return NextResponse.json(
          { error: `Failed to fetch image (${r.status}): ${txt.slice(0, 200)}` },
          { status: 400 }
        );
      }
      arrayBuffer = await r.arrayBuffer();
      contentType = r.headers.get("content-type") || "image/png";
    }

    // Upload to Vercel Blob (public)
    const filename = `print/print_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const blobBody = new Blob([arrayBuffer], { type: contentType });

    const uploaded = await put(filename, blobBody, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ url: uploaded.url });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}