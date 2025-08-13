// app/success/page.tsx
import Stripe from "stripe";
import Link from "next/link";

export const runtime = "nodejs";

function money(pence?: number | null, currency = "gbp") {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(pence / 100);
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SuccessPage({
  searchParams,
}: {
  // ✅ On your Next version, searchParams is a Promise
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = sp.session_id;
  const sessionId =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

  let session: Stripe.Checkout.Session | null = null;

  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer"],
    });
  }

  const m = (session?.metadata || {}) as Record<string, string>;
  const email = session?.customer_details?.email || "";
  const total = money(session?.amount_total, session?.currency || "gbp");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-green-100 text-green-700">
            ✓
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Payment successful</h1>
            <p className="text-sm text-zinc-600">
              Thanks{email ? `, ${email}` : ""}! Your order is processing.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-zinc-50 p-4">
            <div className="mb-2 font-medium">Order summary</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Side</dt>
                <dd>{m.side || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Colour</dt>
                <dd>{m.color || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Size</dt>
                <dd>{m.size || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Material</dt>
                <dd>{m.material || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Quantity</dt>
                <dd>{m.qty || "—"}</dd>
              </div>
              <div className="mt-2 h-px bg-zinc-200" />
              <div className="flex items-center justify-between">
                <dt className="font-medium">Total</dt>
                <dd className="font-semibold">{total}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border bg-zinc-50 p-4">
            <div className="mb-2 font-medium">Assets</div>
            {m.printFileUrl ? (
              <a
                className="inline-block rounded-lg border bg-white px-3 py-2 text-sm text-blue-600 underline hover:bg-zinc-50"
                href={m.printFileUrl}
                target="_blank"
                rel="noreferrer"
              >
                Download print file (PNG)
              </a>
            ) : (
              <p className="text-sm text-zinc-600">
                Print file will be attached to your order.
              </p>
            )}
            {m.prompt ? (
              <p className="mt-3 text-xs text-zinc-500">
                Prompt: <span className="italic">{m.prompt}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/edit" className="text-sm text-blue-600 underline">
            Design another →
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-black px-5 py-2 text-white hover:bg-zinc-900"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}