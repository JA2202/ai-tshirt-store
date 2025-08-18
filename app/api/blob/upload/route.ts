// app/api/blob/upload/route.ts
import { NextResponse, NextRequest } from "next/server";
import { handleUpload } from "@vercel/blob/client";

export async function POST(req: NextRequest) {
  try {
    // parse the JSON the client `upload()` sent
    const body = await req.json();

    const json = await handleUpload({
      request: req,
      body, // <-- required
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/png"],
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("Blob uploaded:", blob.url);
      },
    });

    return NextResponse.json(json);
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}