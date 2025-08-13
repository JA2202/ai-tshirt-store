// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  createPrintfulDraftOrder,
  LineItem,
  Recipient,
  Side,
  Color,
  Material,
} from "@/lib/printful";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return new NextResponse("Stripe env missing", { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig ?? "",
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (e: unknown) {
      console.error("Webhook signature verification failed:", e);
      return new NextResponse("Invalid signature", { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const obj = event.data.object as Stripe.Checkout.Session;

      // Retrieve the full session; support both SDK typings:
      // - pre-"basil": returns Session
      // - "basil": returns Response<Session> with .data
      const sessionRes = await stripe.checkout.sessions.retrieve(obj.id, {
        expand: ["customer", "line_items", "payment_intent"],
      });
      const session: Stripe.Checkout.Session =
        (sessionRes as { data?: Stripe.Checkout.Session }).data ??
        (sessionRes as Stripe.Checkout.Session);

      // Metadata from Checkout creation
      const md = (session.metadata || {}) as Record<string, string>;
      const side: Side = (md.side as Side) || "front";
      const color: Color = (md.color as Color) || "white";
      const material: Material = (md.material as Material) || "standard";
      const size = md.size || "M";
      const qtyNum = Math.max(1, Number(md.qty || "1"));
      const printFileUrl = md.printFileUrl || "";

      // Build recipient using customer_details with fallback to PaymentIntent.shipping
      const pi =
        typeof session.payment_intent === "string"
          ? undefined
          : (session.payment_intent as Stripe.PaymentIntent);
      const cd = session.customer_details;

      const name = cd?.name ?? pi?.shipping?.name ?? undefined;
      const addr = cd?.address ?? pi?.shipping?.address ?? undefined;
      const email = cd?.email ?? undefined;
      const phone = cd?.phone ?? pi?.shipping?.phone ?? undefined;

      if (!addr || !name) {
        console.warn(
          "Stripe session missing shipping address or recipient name; skipping Printful order."
        );
        return new NextResponse("ok", { status: 200 });
      }
      if (!printFileUrl) {
        console.warn("No printFileUrl in session metadata; skipping Printful order.");
        return new NextResponse("ok", { status: 200 });
      }

      const recipient: Recipient = {
        name,
        address1: addr.line1 || "",
        address2: addr.line2 || undefined,
        city: addr.city || "",
        state_code: addr.state || undefined,
        country_code: (addr.country || "GB").toUpperCase(),
        zip: addr.postal_code || "",
        phone,
        email,
      };

      const items: LineItem[] = [
        {
          material,
          color,
          size,
          qty: qtyNum,
          side,
          printFileUrl,
        },
      ];

      const created = await createPrintfulDraftOrder({
        external_id: session.id, // tie Printful order back to Stripe session
        recipient,
        items,
        confirm: false, // keep as DRAFT for the demo
      });

      if (!created.ok) {
        console.error("Printful draft order failed:", created.error);
      } else {
        console.log(`Printful draft order created: ${created.orderId}`);
      }
    }

    return new NextResponse("ok", { status: 200 });
  } catch (e: unknown) {
    console.error("Webhook handler error:", e);
    return new NextResponse("Webhook handler failed", { status: 500 });
  }
}