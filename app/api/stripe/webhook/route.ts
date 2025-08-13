import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  createDraftOrderV2,
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

/** Minimal shapes we need from shipping details, without using `any`. */
type ShipAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type ShippingDetailsLite = {
  name?: string | null;
  phone?: string | null;
  address?: ShipAddress | null;
};

/** Read possible session.shipping_details (varies by API versions). */
function readSessionShipping(session: Stripe.Checkout.Session): ShippingDetailsLite | null {
  const s = session as unknown as { shipping_details?: ShippingDetailsLite | null };
  const ship = s.shipping_details ?? null;
  if (!ship) return null;
  return {
    name: ship.name ?? null,
    phone: ship.phone ?? null,
    address: ship.address
      ? {
          line1: ship.address.line1 ?? null,
          line2: ship.address.line2 ?? null,
          city: ship.address.city ?? null,
          state: ship.address.state ?? null,
          postal_code: ship.address.postal_code ?? null,
          country: ship.address.country ?? null,
        }
      : null,
  };
}

/** Map PaymentIntent.shipping to our lite type. */
function mapPIShipping(pi: Stripe.PaymentIntent | null): ShippingDetailsLite | null {
  if (!pi?.shipping) return null;
  const sh = pi.shipping;
  return {
    name: sh.name ?? null,
    phone: sh.phone ?? null,
    address: sh.address
      ? {
          line1: sh.address.line1 ?? null,
          line2: sh.address.line2 ?? null,
          city: sh.address.city ?? null,
          state: sh.address.state ?? null,
          postal_code: sh.address.postal_code ?? null,
          country: sh.address.country ?? null,
        }
      : null,
  };
}

/** Build Printful recipient from shipping + customer details. */
function buildRecipient(opts: {
  ship: ShippingDetailsLite | null;
  customer: Stripe.Checkout.Session.CustomerDetails | null | undefined;
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

  const email = asString(customer?.email ?? undefined);
  if (email) out.email = email;

  const phone = asString(ship?.phone ?? undefined) ?? asString(customer?.phone ?? undefined);
  if (phone) out.phone = phone;

  return out;
}

function isHttpUrl(u: string | undefined): u is string {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

export async function POST(req: Request) {
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

      // Expand safe fields; `shipping_details` is not expandable.
      const full = await stripe.checkout.sessions.retrieve(data.id, {
        expand: ["customer_details", "payment_intent"],
      });

      // 1) Try session.shipping_details; 2) else PaymentIntent.shipping
      let ship: ShippingDetailsLite | null = readSessionShipping(full);
      if (!ship) {
        let pi: Stripe.PaymentIntent | null = null;
        if (typeof full.payment_intent === "string") {
          pi = await stripe.paymentIntents.retrieve(full.payment_intent);
        } else if (full.payment_intent && typeof full.payment_intent !== "string") {
          pi = full.payment_intent as Stripe.PaymentIntent;
        }
        ship = mapPIShipping(pi);
      }

      const recipient = buildRecipient({
        ship,
        customer: full.customer_details,
      });

      const md = full.metadata ?? {};
      const printFileUrl = asString(md.printFileUrl);
      const side = (asString(md.side) ?? "front") as "front" | "back";
      const color = (asString(md.color) ?? "white") as ColorKey;
      const size = (asString(md.size) ?? "M") as SizeKey;
      const material = (asString(md.material) ?? "standard") as MaterialKey;
      const qty = Math.max(1, Number(md.qty ?? "1"));

      if (!isHttpUrl(printFileUrl)) {
        console.warn("No valid printFileUrl in session metadata; skipping Printful order.");
        return new NextResponse("ok", { status: 200 });
      }
      if (!recipient) {
        console.warn("Missing or incomplete shipping details; skipping Printful order.");
        return new NextResponse("ok", { status: 200 });
      }

      const variantId = resolveVariantId(material, color, size);

      // ⚙️ FIX: Use short, unique, idempotent external_id (Printful max 32 chars)
      const externalId = event.id.slice(0, 32);

      // Create a DRAFT order in Printful v2 (DTG, front/back)
      try {
        const order = await createDraftOrderV2({
          external_id: externalId,
          recipient,
          retail_costs: { currency: "GBP" },
          order_items: [
            {
              source: "catalog",
              catalog_variant_id: variantId,
              quantity: qty,
              placements: [
                {
                  placement: side, // "front" | "back"
                  technique: "dtg",
                  layers: [{ type: "file", url: printFileUrl }],
                },
              ],
            },
          ],
        });

        console.log("✅ Printful v2 draft order created:", JSON.stringify(order));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // If external_id was already used, treat as idempotent success (retry)
        if (msg.includes("external_id") && msg.includes("already used")) {
          console.warn("Printful order already exists for", externalId, "- treating as success.");
        } else {
          throw e;
        }
      }
    }

    return new NextResponse("ok", { status: 200 });
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    // Return 200 so Stripe doesn't retry forever; you still get logs for debugging
    return new NextResponse("ok", { status: 200 });
  }
}