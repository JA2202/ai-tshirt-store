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

if (!stripeSecret) {
  throw new Error("STRIPE_SECRET_KEY is missing");
}
if (!webhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET is missing");
}

// apiVersion is optional; omit to match your installed SDK/types
const stripe = new Stripe(stripeSecret);

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x : undefined;
}

/** Read a few fields safely from the expanded session. */
function getRecipientFromSession(session: Stripe.Checkout.Session): PFRecipient | null {
  // Types across versions vary; read via unknown-safe adapter:
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

  const out: PFRecipient = {
    name,
    address1,
    city,
    zip,
    country_code,
  };

  const state = asString(addr?.state ?? undefined);
  if (state) out.state_code = state;

  const email = asString(s.customer_details?.email ?? undefined);
  if (email) out.email = email;

  const phone = asString(ship?.phone ?? undefined) ?? asString(s.customer_details?.phone ?? undefined);
  if (phone) out.phone = phone;

  return out;
}

export async function POST(req: Request) {
  // Stripe requires the exact raw payload for signature verification
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
    switch (event.type) {
      case "checkout.session.completed": {
        const data = event.data.object as Stripe.Checkout.Session;

        // Retrieve a fully expanded session (so we can read shipping details)
        const full = await stripe.checkout.sessions.retrieve(data.id, {
          expand: ["shipping_details", "customer_details", "payment_intent"],
        });

        // Read your metadata written at checkout creation
        const md = full.metadata ?? {};
        const printFileUrl = asString(md.printFileUrl);
        const side = (asString(md.side) ?? "front") as "front" | "back";
        const color = (asString(md.color) ?? "white") as ColorKey;
        const size = (asString(md.size) ?? "M") as SizeKey;
        const material = (asString(md.material) ?? "standard") as MaterialKey;
        const qty = Math.max(1, Number(md.qty ?? "1"));

        if (!printFileUrl) {
          console.warn("No printFileUrl in session metadata; skipping Printful order.");
          break; // still return 200
        }

        const recipient = getRecipientFromSession(full);
        if (!recipient) {
          console.warn("Missing or incomplete shipping details; skipping Printful order.");
          break; // still 200
        }

        // Resolve the Printful catalog variant id
        const variantId = resolveVariantId(material, color, size);

        // Create a Printful DRAFT order
        const res = await createDraftOrder({
          external_id: `stripe_${full.id}`,
          recipient,
          items: [
            {
              quantity: qty,
              variant_id: variantId,
              files: [
                { url: printFileUrl, type: "default", position: side },
                // Optional preview image (same as default for demo):
                { url: printFileUrl, type: "preview", position: side },
              ],
            },
          ],
          confirm: false,
          retail_costs: { currency: "GBP" },
        });

        console.log("✅ Printful draft order created:", JSON.stringify(res));
        break;
      }

      default:
        // For other event types we don't need special handling
        break;
    }

    // Always respond 200 so Stripe doesn't retry
    return new NextResponse("ok", { status: 200 });
  } catch (err) {
    // Log but return 200 to avoid repeated Stripe retries
    console.error("❌ Error in webhook handler:", err);
    return new NextResponse("ok", { status: 200 });
  }
}