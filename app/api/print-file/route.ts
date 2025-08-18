// app/api/print-file/route.ts
import { NextResponse } from "next/server";

type PrintfulFileResult = {
  id?: number;
  url?: string;
  filename?: string;
  type?: string;
};

type PrintfulResp = {
  code?: number;
  result?: PrintfulFileResult;
  error?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; imageUrl?: string };
    const incomingUrl = body?.url ?? body?.imageUrl;

    if (!incomingUrl || typeof incomingUrl !== "string") {
      return NextResponse.json({ error: "Missing 'url'." }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(incomingUrl)) {
      return NextResponse.json({ error: "URL must be http(s)." }, { status: 400 });
    }

    // (Optional) quick sanity check that it exists and looks like an image
    try {
      const head = await fetch(incomingUrl, { method: "HEAD" });
      const ct = head.headers.get("content-type") || "";
      if (!head.ok) throw new Error(`HEAD ${head.status}`);
      if (!ct.startsWith("image/")) {
        // Not fatal—some CDNs don't return proper HEAD content-type.
        console.warn("[/api/print-file] Non-image content-type:", ct);
      }
    } catch (e) {
      console.warn("[/api/print-file] HEAD check failed:", e);
    }

    const key = process.env.PRINTFUL_API_KEY;
    let pfResult: PrintfulFileResult | undefined;

    if (key) {
      // Forward the URL to Printful to create a file record (no bytes uploaded here)
      const pfRes = await fetch("https://api.printful.com/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: incomingUrl }),
      });

      const pfJson = (await pfRes.json()) as PrintfulResp;

      if (!pfRes.ok) {
        const msg = pfJson?.error || `Printful error (${pfRes.status})`;
        console.error("[/api/print-file] Printful error:", msg);
        // Fallback: still return the URL so your checkout can proceed using the public URL directly
        return NextResponse.json(
          {
            url: incomingUrl,
            publicUrl: incomingUrl,
            file: { url: incomingUrl },
            warning: msg,
          },
          { status: 200 }
        );
      }

      pfResult = pfJson?.result;
    } else {
      console.warn("[/api/print-file] PRINTFUL_API_KEY not set; returning pass-through URL.");
    }

    const finalUrl = pfResult?.url || incomingUrl;

    // Shape kept compatible with previous client parsing:
    //   url | pngUrl | publicUrl | file.url
    return NextResponse.json(
      {
        url: finalUrl,
        publicUrl: finalUrl,
        pngUrl: finalUrl,
        fileId: pfResult?.id,
        file: { url: finalUrl },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[/api/print-file] Unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}