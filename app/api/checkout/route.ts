// app/api/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

type Material = "standard" | "eco" | "premium";
type Color = "white" | "black" | "heather";
type Side = "front" | "back";

const toPence = (gbp: number) => Math.max(0, Math.round(gbp * 100));

const BASE_PRICE_MATERIAL: Record<Material, number> = {
  standard: 12,
  eco: 14,
  premium: 18,
};
const COLOR_SURCHARGE: Record<Color, number> = {
  white: 0,
  black: 1,
  heather: 0.5,
};
const SIZE_SURCHARGE: Record<string, number> = {
  XS: 0,
  S: 0,
  M: 0,
  L: 0,
  XL: 1.5,
  XXL: 2.5,
};

function computeUnitGBP(material: Material, color: Color, size: string) {
  const base = BASE_PRICE_MATERIAL[material] ?? 12;
  const colorAdj = COLOR_SURCHARGE[color] ?? 0;
  const sizeAdj = SIZE_SURCHARGE[size] ?? 0;
  return base + colorAdj + sizeAdj;
}

function siteBase(req: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    const {
      imageUrl,
      nX,
      nY,
      nW,
      rotationDeg,
      removeWhite,
      side,
      color,
      size,
      material,
      qty,
      printFileUrl,
      prompt,
    }: {
      imageUrl?: string;
      nX?: number;
      nY?: number;
      nW?: number;
      rotationDeg?: number;
      removeWhite?: boolean;
      side: Side;
      color: Color;
      size: string;
      material: Material;
      qty: number;
      printFileUrl?: string;
      prompt?: string;
    } = await req.json();

    const quantity = Math.max(1, Math.min(999, Number(qty || 1)));
    const unitGBP = computeUnitGBP(material, color, size);
    const unitPence = toPence(unitGBP);
    const baseUrl = siteBase(req);

    // Ensure a persisted print file URL
    let finalPrintUrl = printFileUrl || "";
    let ppiStatus = "";
    let effectivePPI = 0;

    if (!finalPrintUrl) {
      if (!imageUrl) {
        return NextResponse.json(
          { error: "Missing imageUrl to render print file." },
          { status: 400 }
        );
      }
      const pfRes = await fetch(`${baseUrl}/api/print-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          nX,
          nY,
          nW,
          rotationDeg,
          removeWhite,
          persist: true,
          meta: { side, color, size, material, qty: quantity, prompt },
        }),
      });
      const pf = (await pfRes.json()) as {
        url?: string;
        ppiStatus?: string;
        effectivePPI?: number;
        error?: string;
      };
      if (!pfRes.ok || !pf.url) {
        return NextResponse.json(
          { error: pf?.error || "Failed to create print file" },
          { status: 500 }
        );
      }
      finalPrintUrl = pf.url;
      ppiStatus = pf.ppiStatus || "";
      effectivePPI = pf.effectivePPI ?? 0;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_creation: "always", // create/attach a Stripe Customer

      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: unitPence,
            product_data: {
              name: `Custom T-shirt (${material}/${color}/${size})`,
              description: `Side: ${side}. Quality: ${ppiStatus || "ok"}.`,
            },
          },
          quantity: quantity,
        },
      ],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        side,
        color,
        size,
        material,
        qty: String(quantity),
        unitPriceGBP: unitGBP.toFixed(2),
        printFileUrl: finalPrintUrl,
        ppiStatus: ppiStatus || "",
        effectivePPI: String(effectivePPI || 0),
        prompt: prompt || "",
      },
      billing_address_collection: "auto",
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    console.error("checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}