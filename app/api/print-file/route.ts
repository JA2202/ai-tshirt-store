// app/api/print-file/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";          // we use Buffer/Blob on Node
export const dynamic = "force-dynamic";   // always run server-side

// Optional CORS/preflight support (safe to keep)
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
  // data:image/png;base64,AAAA...
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error("Invalid data URL");
  const mime = m[1] || "application/octet-stream";
  const bin = Buffer.from(m[2], "base64");
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return { mime, buffer: ab };
}

export async function POST(req: Request) {
  // read JSON body safely
  let body: any = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  const imageUrl: string | undefined = body?.imageUrl?.trim();
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
    // fetch or decode the image → ArrayBuffer + contentType
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

    // upload to Vercel Blob
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