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

const stripeSecret = process.env.STRIPE_SECRET_KEY!;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!stripeSecret) throw new Error("STRIPE_SECRET_KEY is missing");
if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is missing");

const stripe = new Stripe(stripeSecret);

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x : undefined;
}

/** Build a Printful recipient from either Session.shipping_details or PI.shipping + customer_details */
function buildRecipient(opts: {
  ship:
    | {
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
      }
    | null;
  customer:
    | {
        email?: string | null;
        phone?: string | null;
      }
    | null;
}): PFRecipient | null {
  const { ship, customer } = opts;
  const addr = ship?.address ?? null;

  const name = asString(ship?.name) ?? "Customer";
  const address1 = asString(addr?.line1);
  const city = asString(addr?.city);
  const zip = asString(addr?.postal_code);
  const country_code = asString(addr?.country);

  if (!address1 || !city || !zip || !country_code) return null;

  const out: PFRecipient = { name, address1, city, zip, country_code };

  const state = asString(addr?.state);
  if (state) out.state_code = state;

  const email = asString(customer?.email);
  if (email) out.email = email;

  const phone = asString(ship?.phone) ?? asString(customer?.phone);
  if (phone) out.phone = phone;

  return out;
}

export async function POST(req: Request) {
  // Stripe needs raw payload for signature verification
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (!sig) throw new Error("Missing stripe-signature header");
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error("❌ Stripe webhook signature verification failed:", err);
    return new NextResponse("Bad signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const data = event.data.object as Stripe.Checkout.Session;

      // ✅ Do NOT try to expand `shipping_details` (not expandable)
      // We expand only what we can (customer_details, payment_intent pointer)
      const full = await stripe.checkout.sessions.retrieve(data.id, {
        expand: ["customer_details", "payment_intent"],
      });

      // Prefer Session.shipping_details if present (some API versions include it directly),
      // otherwise fall back to PaymentIntent.shipping.
      const sessionAny = full as unknown as { shipping_details?: any | null };
      let ship: any | null = sessionAny.shipping_details ?? null;

      // If shipping not on Session, load PaymentIntent and use its `shipping`
      if (!ship) {
        let pi: Stripe.PaymentIntent | null = null;
        if (typeof full.payment_intent === "string") {
          pi = await stripe.paymentIntents.retrieve(full.payment_intent);
        } else if (full.payment_intent && typeof full.payment_intent !== "string") {
          pi = full.payment_intent as Stripe.PaymentIntent;
        }
        ship = (pi?.shipping as any) ?? null;
      }

      // Build recipient from shipping + customer details
      const recipient = buildRecipient({
        ship,
        customer: (full as unknown as { customer_details?: any | null }).customer_details ?? null,
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
    // Return 200 so Stripe doesn't retry forever; you still get logs
    return new NextResponse("ok", { status: 200 });
  }
}