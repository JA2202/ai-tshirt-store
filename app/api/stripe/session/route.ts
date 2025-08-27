// /app/api/stripe/session/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

// ✅ omit apiVersion to use the SDK's pinned version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { session_id } = (await req.json()) as { session_id: string };
    if (!session_id) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items.data.price.product", "total_details.breakdown"],
    });

    const currency = (session.currency || "gbp").toUpperCase();
    const value = (session.amount_total ?? 0) / 100;
    const tax = (session.total_details?.amount_tax ?? 0) / 100;
    const shipping = (session.total_details?.amount_shipping ?? 0) / 100;

    const items =
      session.line_items?.data.map((li) => ({
        item_id: (li.price?.product as Stripe.Product | string)?.toString(),
        item_name:
          typeof li.price?.product === "object"
            ? (li.price?.product as Stripe.Product).name
            : li.description || "Item",
        price: (li.amount_subtotal ?? 0) / 100 / (li.quantity || 1),
        quantity: li.quantity || 1,
      })) ?? [];

    return NextResponse.json({
      transaction_id: session.id,
      currency,
      value,
      tax,
      shipping,
      items,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}