// app/success/page.tsx
import Stripe from "stripe";
import Link from "next/link";
import Script from "next/script"; // ← GTM purchase push

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

  const address = session?.customer_details?.address;
  const formattedAddress = address
    ? [address.line1, address.line2, address.city, address.postal_code, address.country]
        .filter(Boolean)
        .join(", ")
    : "";

  // --- GTM purchase payload (server-prepared, injected via <Script>) ---
  const qtyNum = Number(m.qty || 1) || 1;
  const valueDec = Number(((session?.amount_total ?? 0) / 100).toFixed(2));
  const unitPriceDec = Number((valueDec / qtyNum).toFixed(2));
  const currencyISO = (session?.currency || "gbp").toUpperCase();

  // GA4 item payload: single custom tee line using your metadata
  const purchasePayload = {
    transaction_id: sessionId || "",
    currency: currencyISO,
    value: valueDec,
    items: [
      {
        item_id: "custom-tee",
        item_name: "Custom T-Shirt",
        item_variant: `${m.color || "color"}-${m.size || "size"}-${m.material || "material"}-${m.side || "front"}`,
        price: unitPriceDec,
        quantity: qtyNum,
        affiliation: "ThreadLabs AI",
      },
    ],
  };
  const purchaseJson = JSON.stringify(purchasePayload);

  return (
    <div className="mx-auto max-w-3xl px-4">
      {/* GTM purchase push: runs once per session_id (guarded by sessionStorage) */}
      {sessionId ? (
        <Script id="gtm-purchase" strategy="afterInteractive">
          {`
            try {
              window.dataLayer = window.dataLayer || [];
              var key = 'gtm_purchase_${sessionId}';
              if (!sessionStorage.getItem(key)) {
                window.dataLayer.push({ ecommerce: null });
                window.dataLayer.push({
                  event: 'purchase',
                  ecommerce: ${purchaseJson}
                });
                sessionStorage.setItem(key, '1');
              }
            } catch (e) {
              // swallow analytics errors
            }
          `}
        </Script>
      ) : null}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        {/* Hero / Confirmation */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-700 text-xl">
              ✓
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Order confirmed</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Thanks{email ? `, ${email}` : ""}! We’ve emailed your receipt.
              </p>
              {sessionId ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Order reference: <span className="font-mono">{sessionId}</span>
                </p>
              ) : null}
            </div>
          </div>
          <span className="rounded-full bg-green-600/10 px-3 py-1 text-xs font-medium text-green-700">
            Paid
          </span>
        </div>

        {/* Content grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Order summary */}
          <div className="rounded-xl border bg-zinc-50 p-4">
            <div className="mb-2 text-base font-medium">Order summary</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Side</dt>
                <dd className="text-zinc-800">{m.side || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Colour</dt>
                <dd className="text-zinc-800">{m.color || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Size</dt>
                <dd className="text-zinc-800">{m.size || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Material</dt>
                <dd className="text-zinc-800">{m.material || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Quantity</dt>
                <dd className="text-zinc-800">{m.qty || "—"}</dd>
              </div>
              {m.prompt ? (
                <div className="flex justify-between">
                  <dt>Design notes</dt>
                  <dd className="text-zinc-600 italic">{m.prompt}</dd>
                </div>
              ) : null}
              <div className="mt-3 h-px bg-zinc-200" />
              <div className="flex items-center justify-between">
                <dt className="font-medium">Total paid</dt>
                <dd className="text-lg font-semibold">{total}</dd>
              </div>
            </dl>
          </div>

          {/* What happens next / Shipping recap */}
          <div className="rounded-xl border bg-zinc-50 p-4">
            <div className="mb-2 text-base font-medium">What happens next</div>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full bg-zinc-200 text-center text-[11px] leading-5">
                  1
                </span>
                <span>We send your design to production.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full bg-zinc-200 text-center text-[11px] leading-5">
                  2
                </span>
                <span>Printing & quality check.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full bg-zinc-200 text-center text-[11px] leading-5">
                  3
                </span>
                <span>You’ll receive a tracking link when it ships.</span>
              </li>
            </ol>

            {/* Shipping address recap (if present) */}
            {formattedAddress ? (
              <>
                <div className="mt-4 h-px bg-zinc-200" />
                <div className="mt-3">
                  <div className="mb-1 text-sm font-medium">Shipping to</div>
                  <p className="text-sm text-zinc-700">{formattedAddress}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Actions */}
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