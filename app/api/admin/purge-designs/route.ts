// app/api/admin/purge-designs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { list, del, type ListBlobResult } from "@vercel/blob";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.ADMIN_PURGE_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefix = "designs/";
  let cursor: string | undefined = undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const { blobs, cursor: next } = (await list({
      prefix,
      cursor,
    })) as ListBlobResult;

    for (const b of blobs) {
      scanned += 1;

      // delete blob
      await del(b.pathname);
      deleted += 1;

      // keep Redis indexes clean
      await redis.zrem("blobs:generated", b.pathname);
      await redis.srem("blobs:protected", b.pathname);
    }

    cursor = next || undefined;
  } while (cursor);

  return NextResponse.json({ scanned, deleted, prefix });
}