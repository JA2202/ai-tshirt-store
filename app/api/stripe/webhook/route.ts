// app/api/stripe/webhook/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  createDraftOrder,
  resolveVariantId,
  type PFRecipient,
  type ColorKey,
  type SizeKey,
  type MaterialKey,
} from "@/lib/printful";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecret) throw new Error("STRIPE_SECRET_KEY is missing");
if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is missing");

const stripe = new Stripe(stripeSecret);

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x : undefined;
}

function getRecipientFromSession(session: Stripe.Checkout.Session): PFRecipient | null {
  const s = session as unknown as {
    shipping_details?: {
      name?: string | null;
      phone?: string | null;
      address?: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postal_code?: string | null;
        country?: string | null;
      } | null;
    } | null;
    customer_details?: {
      email?: string | null;
      phone?: string | null;
    } | null;
  };

  const ship = s.shipping_details ?? null;
  const addr = ship?.address ?? null;

  const name = asString(ship?.name ?? undefined) ?? "Customer";
  const address1 = asString(addr?.line1 ?? undefined);
  const city = asString(addr?.city ?? undefined);
  const zip = asString(addr?.postal_code ?? undefined);
  const country_code = asString(addr?.country ?? undefined);

  if (!address1 || !city || !zip || !country_code) return null;

  const out: PFRecipient = { name, address1, city, zip, country_code };

  const state = asString(addr?.state ?? undefined);
  if (state) out.state_code = state;

  const email = asString(s.customer_details?.email ?? undefined);
  if (email) out.email = email;

  const phone = asString(ship?.phone ?? undefined) ?? asString(s.customer_details?.phone ?? undefined);
  if (phone) out.phone = phone;

  return out;
}

export async function POST(req: Request) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (!sig) throw new Error("Missing stripe-signature header");
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret!);
  } catch (err) {
    console.error("❌ Stripe webhook signature verification failed:", err);
    return new NextResponse("Bad signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const data = event.data.object as Stripe.Checkout.Session;
      const full = await stripe.checkout.sessions.retrieve(data.id, {
        expand: ["shipping_details", "customer_details", "payment_intent"],
      });

      const md = full.metadata ?? {};
      const printFileUrl = asString(md.printFileUrl);
      const side = (asString(md.side) ?? "front") as "front" | "back";
      const color = (asString(md.color) ?? "white") as ColorKey;
      const size = (asString(md.size) ?? "M") as SizeKey;
      const material = (asString(md.material) ?? "standard") as MaterialKey;
      const qty = Math.max(1, Number(md.qty ?? "1"));

      if (!printFileUrl) {
        console.warn("No printFileUrl in session metadata; skipping Printful order.");
        return new NextResponse("ok", { status: 200 });
      }

      const recipient = getRecipientFromSession(full);
      if (!recipient) {
        console.warn("Missing or incomplete shipping details; skipping Printful order.");
        return new NextResponse("ok", { status: 200 });
      }

      const variantId = resolveVariantId(material, color, size);

      const res = await createDraftOrder({
        external_id: `stripe_${full.id}`,
        recipient,
        items: [
          {
            quantity: qty,
            variant_id: variantId,
            files: [
              { url: printFileUrl, type: "default", position: side },
              { url: printFileUrl, type: "preview", position: side },
            ],
          },
        ],
        confirm: false,
        retail_costs: { currency: "GBP" },
      });

      console.log("✅ Printful draft order created:", JSON.stringify(res));
    }

    return new NextResponse("ok", { status: 200 });
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    // we still return 200 so Stripe doesn't retry forever
    return new NextResponse("ok", { status: 200 });
  }
}