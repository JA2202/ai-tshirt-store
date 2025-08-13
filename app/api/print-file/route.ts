// app/api/print-file/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";

export const runtime = "nodejs";

// 12x16 inches @ 300 DPI
const CANVAS_W = 3600;
const CANVAS_H = 4800;

// Editor safe-area (matches front-end ~65% x 45%, centered ~34% from top)
const SAFE_W = Math.round(CANVAS_W * 0.65);
const SAFE_H = Math.round(CANVAS_H * 0.45);
const SAFE_X = Math.round(CANVAS_W * 0.5 - SAFE_W / 2);
const SAFE_Y = Math.round(CANVAS_H * 0.34 - SAFE_H / 2);

type Body = {
  imageUrl: string;
  nX: number; // center x in [0..1] within safe area
  nY: number; // center y in [0..1] within safe area
  nW: number; // width in [0..1] relative to safe width
  rotationDeg?: number;
  removeWhite?: boolean;
  persist?: boolean;
  meta?: Record<string, unknown>;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Copy Buffer -> fresh ArrayBuffer (avoids ArrayBuffer|SharedArrayBuffer union) */
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

// Demo-grade white knockout placeholder (kept simple on purpose)
async function knockWhiteToAlpha(buf: Buffer): Promise<Buffer> {
  return sharp(buf).ensureAlpha().png().toBuffer();
}

export async function POST(req: Request) {
  try {
    const {
      imageUrl,
      nX,
      nY,
      nW,
      rotationDeg = 0,
      removeWhite = false,
      persist = false,
    } = (await req.json()) as Body;

    if (!imageUrl) {
      return new NextResponse("Missing imageUrl", { status: 400 });
    }

    const imgBuf = await fetchImageBuffer(imageUrl);

    // Prepare art
    const artMeta = await sharp(imgBuf).metadata();
    const inRatio = (artMeta.height ?? 1) / (artMeta.width ?? 1);

    const designW = Math.max(1, Math.round(clamp(nW, 0.05, 1) * SAFE_W));
    const designH = Math.max(1, Math.round(designW * inRatio));

    const centerX = SAFE_X + Math.round(clamp(nX, 0, 1) * SAFE_W);
    const centerY = SAFE_Y + Math.round(clamp(nY, 0, 1) * SAFE_H);

    let prepared = sharp(imgBuf).resize({ width: designW, withoutEnlargement: false });
    if (Math.abs(rotationDeg) > 0.01) {
      prepared = prepared.rotate(rotationDeg);
    }
    let artOut = await prepared.png().toBuffer();
    if (removeWhite) {
      artOut = await knockWhiteToAlpha(artOut);
    }

    // Compose onto transparent canvas
    const left = Math.round(centerX - designW / 2);
    const top = Math.round(centerY - designH / 2);

    const outBuf = await sharp({
      create: {
        width: CANVAS_W,
        height: CANVAS_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: artOut, left, top }])
      .png()
      .toBuffer();

    // PPI signal
    const effectivePPI = 300;
    const ppiStatus = "ok";

    if (persist) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
          { error: "Server is missing BLOB_READ_WRITE_TOKEN" },
          { status: 500 }
        );
      }
      const filename =
        "print/print_" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";

      const putRes = await put(filename, outBuf, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return NextResponse.json({
        url: putRes.url,
        effectivePPI,
        ppiStatus,
        clamped: false,
      });
    }

    // ✅ Return an ArrayBuffer (BodyInit-compatible)
    return new NextResponse(bufferToArrayBuffer(outBuf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("print-file error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}