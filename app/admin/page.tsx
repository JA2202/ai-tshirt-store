// app/admin/page.tsx
import Stripe from "stripe";
import { list } from "@vercel/blob";

export const dynamic = "force-dynamic"; // always SSR

type SearchParams = { [key: string]: string | string[] | undefined };

function spGet(sp?: SearchParams, key?: string) {
  const v = key ? sp?.[key] : undefined;
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

function fmtGBP(pennies: number | null | undefined) {
  if (pennies == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pennies / 100);
}

function toMillis(d: string | Date | undefined): number {
  if (!d) return 0;
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}
function niceDate(d: string | Date | undefined): string {
  const ms = toMillis(d);
  return ms ? new Date(ms).toLocaleString() : "—";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  // Simple gate via ?key=... (optional: if ADMIN_KEY not set, page is open)
  const provided = spGet(searchParams, "key");
  const allowed =
    !process.env.ADMIN_KEY || provided === process.env.ADMIN_KEY;

  if (!allowed) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Unauthorized. Append <code>?key=YOUR_KEY</code> to the URL.
        </p>
      </main>
    );
  }

  // ----- Stripe: list most recent checkout sessions -----
  let sessions:
    | Array<{
        id: string;
        amount_total: number | null;
        currency: string | null;
        created: number;
        customer_email: string | null | undefined;
        status: string | null;
        url?: string | null;
        md?: Record<string, string>;
      }>
    | null = null;

  if (process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const res = await stripe.checkout.sessions.list({ limit: 20 });
    sessions = res.data.map((s) => ({
      id: s.id,
      amount_total: s.amount_total,
      currency: s.currency,
      created: s.created,
      customer_email: s.customer_details?.email,
      status: s.status ?? null,
      url: s.url,
      md: (s.metadata as Record<string, string>) ?? {},
    }));
  }

  // ----- Blob: list saved order JSON records -----
  // (Webhook wrote files under orders/order_*.json)
  type SavedOrderRow = {
    key: string;
    url: string;
    uploadedAt?: string | Date; // <-- accept Date or string
    stripeSessionId?: string;
    stripeEventId?: string;
    printfulOrderId?: number;
    printfulExternalId?: string;
    amountGBP?: number;
  };

  let savedOrders: SavedOrderRow[] | null = null;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { blobs } = await list({ prefix: "orders/", limit: 50 });
      const sorted = blobs.sort(
        (a, b) => toMillis(b.uploadedAt) - toMillis(a.uploadedAt)
      );

      const top = sorted.slice(0, 20);
      const details = await Promise.all(
        top.map(async (b): Promise<SavedOrderRow> => {
          // Try to fetch JSON body (public access assumed)
          let stripeSessionId: string | undefined;
          let stripeEventId: string | undefined;
          let printfulOrderId: number | undefined;
          let printfulExternalId: string | undefined;
          let amountGBP: number | undefined;

          try {
            const r = await fetch(b.url, { cache: "no-store" });
            const j = (await r.json()) as Record<string, any>;
            // Resilient to shape differences:
            stripeSessionId =
              j?.stripe?.sessionId ??
              j?.stripeSessionId ??
              j?.session?.id ??
              undefined;
            stripeEventId =
              j?.stripe?.eventId ?? j?.stripeEventId ?? j?.event?.id;
            printfulOrderId =
              j?.printful?.orderId ?? j?.printfulOrderId ?? j?.orderId;
            printfulExternalId =
              j?.printful?.external_id ??
              j?.printfulExternalId ??
              j?.external_id;
            amountGBP =
              typeof j?.amountGBP === "number" ? j.amountGBP : undefined;
          } catch {
            // ignore parse errors
          }

          return {
            key: b.pathname,
            url: b.url,
            uploadedAt: b.uploadedAt, // could be Date or string
            stripeSessionId,
            stripeEventId,
            printfulOrderId,
            printfulExternalId,
            amountGBP,
          };
        })
      );

      savedOrders = details;
    } catch {
      savedOrders = [];
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Quick read-only view. Data sources: Stripe (sessions) &amp; Vercel Blob
        (<code>orders/*.json</code>).
      </p>

      {/* Stripe sessions */}
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium">Recent Stripe Checkout Sessions</h2>
          <span className="text-xs text-zinc-500">
            Env: {process.env.NEXT_PUBLIC_SITE_URL?.includes("vercel.app") ? "Vercel" : "Local"}
          </span>
        </div>

        {!sessions ? (
          <div className="rounded-lg border p-4 text-sm text-zinc-600">
            Stripe not configured (missing <code>STRIPE_SECRET_KEY</code>).
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-zinc-600">
            No sessions yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Metadata (color/size/material)</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">
                      {new Date(s.created * 1000).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        className="text-sky-700 underline"
                        href={`https://dashboard.stripe.com${
                          process.env.NODE_ENV !== "production" ? "/test" : ""
                        }/checkout/sessions/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {s.id}
                      </a>
                    </td>
                    <td className="px-3 py-2">{s.customer_email ?? "—"}</td>
                    <td className="px-3 py-2">{fmtGBP(s.amount_total)}</td>
                    <td className="px-3 py-2">{s.status ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {[
                        s.md?.color && `color:${s.md.color}`,
                        s.md?.size && `size:${s.md.size}`,
                        s.md?.material && `material:${s.md.material}`,
                        s.md?.qty && `qty:${s.md.qty}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Saved orders in Blob */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">Saved Orders (Blob)</h2>

        {!process.env.BLOB_READ_WRITE_TOKEN ? (
          <div className="rounded-lg border p-4 text-sm text-zinc-600">
            Blob listing disabled (missing{" "}
            <code>BLOB_READ_WRITE_TOKEN</code>). This section will show mappings
            from Stripe → Printful if your webhook saves files under{" "}
            <code>orders/</code>.
          </div>
        ) : !savedOrders || savedOrders.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-zinc-600">
            No saved order files found under <code>orders/</code>.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2">Blob key</th>
                  <th className="px-3 py-2">Stripe session</th>
                  <th className="px-3 py-2">Stripe event</th>
                  <th className="px-3 py-2">Printful</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {savedOrders.map((o) => (
                  <tr key={o.key} className="border-t">
                    <td className="px-3 py-2 tabular-nums">
                      {niceDate(o.uploadedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-700 underline"
                        title="Open JSON"
                      >
                        {o.key.replace(/^orders\//, "")}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      {o.stripeSessionId ? (
                        <a
                          className="text-sky-700 underline"
                          href={`https://dashboard.stripe.com${
                            process.env.NODE_ENV !== "production"
                              ? "/test"
                              : ""
                          }/checkout/sessions/${o.stripeSessionId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {o.stripeSessionId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{o.stripeEventId ?? "—"}</td>
                    <td className="px-3 py-2">
                      {o.printfulOrderId ? (
                        <a
                          className="text-sky-700 underline"
                          href={`https://www.printful.com/dashboard/orders/${o.printfulOrderId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          #{o.printfulOrderId}
                        </a>
                      ) : o.printfulExternalId ? (
                        <span className="text-zinc-600">
                          ext: {o.printfulExternalId}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {typeof o.amountGBP === "number"
                        ? new Intl.NumberFormat("en-GB", {
                            style: "currency",
                            currency: "GBP",
                          }).format(o.amountGBP)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}