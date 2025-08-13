import { NextResponse } from "next/server";
import sharp from "sharp";
import { put } from "@vercel/blob";

export const runtime = "nodejs"; // sharp requires Node runtime

// Print area: 12" x 16" @ 300 DPI
const PRINT_W = 3600;
const PRINT_H = 4800;

// Guardrails
const MAX_DIMENSION = 12000;      // px (either side)
const MAX_PIXELS = 10000 * 10000; // 100 MP
const MIN_PPI_OK = 300;
const MIN_PPI_WARN = 200;

type Payload = {
  imageUrl: string;         // http(s) or data: URL
  nX: number;               // center X in safe area [0..1]
  nY: number;               // center Y in safe area [0..1]
  nW: number;               // width fraction of safe area [0..1]
  rotationDeg: number;      // -180..180
  persist?: boolean;        // if true, save to Vercel Blob and return URL
  removeWhite?: boolean;    // if true, naive white-to-alpha
  meta?: Record<string, any>; // arbitrary metadata (side/color/size/material/qty/prompt etc.)
};

async function loadBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma === -1) throw new Error("Bad data URL");
    return Buffer.from(url.slice(comma + 1), "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Optional naive white-matte removal: create a binary alpha from luminance */
async function applyRemoveWhite(src: Buffer): Promise<Buffer> {
  // 1) Build a binary mask where near-white -> 0 alpha, darker -> 255
  const mask = await sharp(src)
    .toColourspace("b-w")
    .threshold(245) // tweak if too aggressive
    .negate()       // white->0, dark->255
    .toFormat("png")
    .toBuffer();

  // 2) Ensure RGB and join mask as alpha
  const rgb = await sharp(src).toColourspace("srgb").removeAlpha().toFormat("png").toBuffer();
  const withAlpha = await sharp(rgb).joinChannel(mask).toBuffer();
  return withAlpha;
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = (await req.json()) as Partial<Payload>;

    // --- Validate input ---
    const imageUrl = String(body.imageUrl || "");
    if (!imageUrl) return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });

    const nX = Math.min(1, Math.max(0, Number(body.nX)));
    const nY = Math.min(1, Math.max(0, Number(body.nY)));
    const nW = Math.min(1, Math.max(0.05, Number(body.nW || 0.4)));
    const rotationDeg = Math.max(-180, Math.min(180, Number(body.rotationDeg || 0)));
    const persist = Boolean(body.persist);
    const removeWhite = Boolean(body.removeWhite);
    const metaIn = body.meta || {};

    // --- Load & inspect source ---
    let srcBuf = await loadBuffer(imageUrl);
    const srcMeta = await sharp(srcBuf).metadata();
    const srcW = srcMeta.width ?? 0;
    const srcH = srcMeta.height ?? 0;

    if (!srcW || !srcH) {
      return NextResponse.json({ error: "Could not read source image size." }, { status: 400 });
    }
    if (srcW > MAX_DIMENSION || srcH > MAX_DIMENSION || srcW * srcH > MAX_PIXELS) {
      return NextResponse.json(
        { error: "Image is too large for server processing. Please use a smaller file." },
        { status: 413 }
      );
    }

    // --- sRGB & optional white removal ---
    if (removeWhite) {
      try {
        srcBuf = await applyRemoveWhite(srcBuf);
      } catch (e) {
        console.warn("removeWhite failed; proceeding without:", e);
      }
    } else {
      // normalize to sRGB and ensure alpha
      srcBuf = await sharp(srcBuf).toColourspace("srgb").ensureAlpha().toBuffer();
    }

    // --- Compute placement in the print canvas ---
    const targetW = Math.round(nW * PRINT_W); // design width on the canvas
    let layer = sharp(srcBuf).ensureAlpha().resize({ width: targetW, withoutEnlargement: false });
    layer = layer.rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } });

    const layerBuf = await layer.toBuffer();
    const layerMeta = await sharp(layerBuf).metadata();
    const layerW = layerMeta.width ?? targetW;
    const layerH = layerMeta.height ?? Math.round(targetW);

    const cx = Math.round(nX * PRINT_W);
    const cy = Math.round(nY * PRINT_H);
    const left = Math.round(cx - layerW / 2);
    const top  = Math.round(cy - layerH / 2);

    // clamp to avoid OOB
    const clampedLeft = Math.max(-layerW, Math.min(PRINT_W, left));
    const clampedTop  = Math.max(-layerH, Math.min(PRINT_H, top));
    const hitBoundary = clampedLeft !== left || clampedTop !== top;

    // --- Effective PPI check ---
    const requiredPxW = targetW;
    const effectivePPI = srcW ? Math.round((srcW * 300) / requiredPxW) : MIN_PPI_WARN;
    const ppiStatus =
      effectivePPI >= MIN_PPI_OK ? "ok" : effectivePPI >= MIN_PPI_WARN ? "warn" : "low";

    // --- Compose final transparent PNG ---
    const outBuf = await sharp({
      create: {
        width: PRINT_W,
        height: PRINT_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: layerBuf, left: clampedLeft, top: clampedTop }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    // --- Metadata (for response & persistence) ---
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const side = typeof metaIn.side === "string" ? metaIn.side : "front";
    const color = typeof metaIn.color === "string" ? metaIn.color : "white";
    const filename = `print_${stamp}_${side}_${color}.png`;

    const outputMeta = {
      printCanvas: { width: PRINT_W, height: PRINT_H, dpi: 300 },
      placement: { nX, nY, nW, rotationDeg, px: { layerW, layerH, left, top } },
      clamped: hitBoundary,
      source: { width: srcW, height: srcH, type: srcMeta.format || "unknown" },
      effectivePPI,
      ppiStatus, // "ok" | "warn" | "low"
      options: { removeWhite },
      userMeta: metaIn,
      createdAt: now.toISOString(),
      durationMs: Date.now() - started,
    };

    // --- Persist or download ---
    if (persist) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
          { error: "Missing BLOB_READ_WRITE_TOKEN env for persistence." },
          { status: 500 }
        );
      }

      // ✅ Save PNG using the Buffer from sharp (this satisfies PutBody)
      const pngUpload = await put(filename, outBuf, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      // ✅ Save metadata JSON as a Buffer
      const metaName = filename.replace(/\.png$/, ".json");
      const metaUpload = await put(metaName, Buffer.from(JSON.stringify(outputMeta, null, 2)), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      console.log("[print-file] saved", {
        file: pngUpload.url,
        meta: metaUpload.url,
        ppi: effectivePPI,
        status: ppiStatus,
        clamped: hitBoundary,
        durationMs: outputMeta.durationMs,
      });

      return NextResponse.json(
        { url: pngUpload.url, metaUrl: metaUpload.url, filename, ...outputMeta },
        { status: 200 }
      );
    }

    // Download mode (no persistence). BodyInit prefers not-shared buffers:
    const bytes = Uint8Array.from(outBuf);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Print-Size": `${PRINT_W}x${PRINT_H}@300DPI`,
        "X-PPI": String(effectivePPI),
        "X-PPI-Status": ppiStatus,
        "X-Clamped": hitBoundary ? "1" : "0",
      },
    });
  } catch (err: any) {
    console.error("print-file error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}