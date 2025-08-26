// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
// ADD ↓
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

const siteURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

type CheckoutBody = {
  side: "front" | "back";
  color: "white" | "black" | "navy";
  size: string;
  material: "standard" | "eco" | "premium";
  qty: number;
  unitPriceGBP: number; // in GBP
  totalPriceGBP: number; // in GBP
  prompt?: string;
  printFileUrl?: string; // if you already persisted one
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe key missing" }, { status: 500 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // --- Shipping: choose free vs flat by subtotal (before shipping) ---
    const qty = Math.max(1, Number(body.qty || 1));
    const merchandiseSubtotalGBP = (body.unitPriceGBP || 0) * qty;
    const freeThresholdGBP =
      Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_GBP || 40);

    const shippingRateFree = process.env.STRIPE_SHIPPING_RATE_FREE; // e.g. 'shr_...'
    const shippingRateFlat = process.env.STRIPE_SHIPPING_RATE_FLAT; // e.g. 'shr_...'

    const useFree = merchandiseSubtotalGBP >= freeThresholdGBP;
    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] =
      shippingRateFree && shippingRateFlat
        ? [{ shipping_rate: useFree ? shippingRateFree : shippingRateFlat }]
        : []; // if not configured, omit and Stripe won't add shipping

    // ADD ↓ Protect the image blob if provided
    if (body.printFileUrl) {
      try {
        const path = new URL(body.printFileUrl).pathname.slice(1); // designs/<jobId>/...
        if (path) {
          await redis.sadd("blobs:protected", path);
        }
      } catch {
        // ignore malformed URL; no change to checkout flow
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      payment_method_types: ["card"],
      phone_number_collection: { enabled: true },
      shipping_address_collection: {
        allowed_countries: ["GB", "US", "CA", "AU", "IE", "FR", "DE", "ES", "IT", "NL"],
      },
      shipping_options: shippingOptions.length ? shippingOptions : undefined,

      // Single line item (demo)
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round((body.unitPriceGBP || 1) * 100),
            product_data: {
              name: `Custom Tee (${body.color}, ${body.size}, ${body.material})`,
              description: `Side: ${body.side}${
                body.prompt ? ` • Prompt: ${body.prompt}` : ""
              }`,
            },
          },
        },
      ],

      // --- Rights/ToS checkbox on Stripe Checkout ---
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message:
            `I confirm I have the rights to print this design and I agree to the Terms (incl. Content Policy)`,
        },
      },

      success_url: `${siteURL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteURL}/cancel`,

      // We’ll use these in the webhook to fulfill with Printful
      metadata: {
        side: body.side,
        color: body.color,
        size: body.size,
        material: body.material,
        qty: String(qty),
        unitPriceGBP: String(body.unitPriceGBP || 0),
        totalPriceGBP: String(body.totalPriceGBP || 0),
        prompt: body.prompt || "",
        printFileUrl: body.printFileUrl || "",
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}