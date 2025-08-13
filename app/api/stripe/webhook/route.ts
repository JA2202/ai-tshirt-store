// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return new NextResponse("Webhook misconfigured", { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing signature", { status: 400 });

  const stripe = new Stripe(key);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error("⚠️ Webhook signature verification failed:", err?.message);
    return new NextResponse(`Bad signature: ${err?.message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const sessionId = (event.data.object as Stripe.Checkout.Session).id;

      // Get full session (include line items & customer)
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items", "customer"],
      });

      const order = {
        id: session.id,
        payment_status: session.payment_status,
        amount_total: session.amount_total, // pence
        currency: session.currency,
        customer_email: session.customer_details?.email ?? null,
        customer_name: session.customer_details?.name ?? null,
        metadata: session.metadata || {},
        line_items: (session.line_items?.data || []).map((li) => ({
          description: li.description,
          quantity: li.quantity,
          amount_total: li.amount_total,
          amount_subtotal: li.amount_subtotal,
        })),
        createdAt: new Date().toISOString(),
      };

      // Persist a simple order record to Blob (demo-friendly)
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const file =
          `orders/order_${new Date().toISOString().replace(/[:.]/g, "-")}_${session.id}.json`;

        await put(
          file,
          JSON.stringify(order, null, 2), // pass a string (no Buffer needed)
          {
            access: "public",          // ← matches current @vercel/blob types
            contentType: "application/json",
            addRandomSuffix: true,     // ← make URL hard to guess
            token: process.env.BLOB_READ_WRITE_TOKEN,
          }
        );
      } else {
        console.log("[order]", order);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err?.message || err);
    return new NextResponse("Webhook handler error", { status: 500 });
  }
}