// app/admin/page.tsx
import Stripe from "stripe";
import { getOrderByExternalId, printfulDashboardOrderUrl } from "@/lib/printful";

export const dynamic = "force-dynamic";

function fmtMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null || !currency) return "—";
  const nf = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
  return nf.format(amount / 100);
}

export default async function AdminPage({ searchParams }: { searchParams: { key?: string } }) {
  // Optional simple guard
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && searchParams?.key !== adminKey) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-xl font-semibold">Admin</h1>
        <p className="text-sm text-zinc-600">
          This page is protected. Append <code>?key=YOUR_ADMIN_KEY</code> to the URL.
        </p>
      </div>
    );
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-red-600">
        STRIPE_SECRET_KEY is missing.
      </div>
    );
  }

  const stripe = new Stripe(stripeSecret);

  // Get the 20 most recent "checkout.session.completed" events
  const events = await stripe.events.list({
    type: "checkout.session.completed",
    limit: 20,
  });

  // For each event, the external_id we used in Printful == event.id
  const rows = await Promise.all(
    events.data.map(async (ev) => {
      const session = ev.data.object as Stripe.Checkout.Session;
      const printful = await getOrderByExternalId(ev.id); // match webhook behavior
      return {
        eventId: ev.id,
        created: new Date((ev.created ?? Date.now()) * 1000),
        sessionId: session.id,
        email: session.customer_details?.email ?? "",
        name: session.customer_details?.name ?? "",
        amountTotal: session.amount_total,
        currency: session.currency,
        printfulOrderId: printful?.id ?? null,
        printfulStatus: printful?.status ?? null,
      };
    })
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Orders (Stripe → Printful)</h1>
      <p className="mb-6 text-sm text-zinc-600">
        Showing recent <code>checkout.session.completed</code> events. We look up a Printful v2
        order by <code>external_id = event.id</code>.
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-zinc-600">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Stripe</th>
              <th className="px-3 py-2">Printful</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stripeSessionUrl = `https://dashboard.stripe.com/${process.env.NODE_ENV === "production" ? "" : "test/"}checkout/sessions/${r.sessionId}`;
              const stripeEventUrl = `https://dashboard.stripe.com/${process.env.NODE_ENV === "production" ? "" : "test/"}events/${r.eventId}`;
              const printfulUrl = r.printfulOrderId ? printfulDashboardOrderUrl(r.printfulOrderId) : null;

              return (
                <tr key={r.eventId} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.created.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name || "—"}</div>
                    <div className="text-xs text-zinc-500">{r.email || "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    {fmtMoney(r.amountTotal, r.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      className="text-blue-600 underline"
                      href={stripeSessionUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open Stripe Checkout Session"
                    >
                      session
                    </a>
                    {" · "}
                    <a
                      className="text-blue-600 underline"
                      href={stripeEventUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open Stripe Event"
                    >
                      event
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    {printfulUrl ? (
                      <a
                        className="text-blue-600 underline"
                        href={printfulUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open Printful Order"
                      >
                        #{r.printfulOrderId} ({r.printfulStatus ?? "draft"})
                      </a>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={5}>
                  No completed sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Tip: set <code>ADMIN_KEY</code> to protect this page and open it as <code>/admin?key=…</code>.
      </p>
    </div>
  );
}