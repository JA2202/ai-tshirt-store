// lib/printful.ts
export type Side = "front" | "back";
export type Color = "white" | "black" | "navy";
export type Material = "standard" | "eco" | "premium";

export interface Recipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code?: string;
  country_code: string; // "GB", "US", etc.
  zip: string;
  phone?: string;
  email?: string;
}

export interface LineItem {
  material: Material;
  color: Color;
  size: string;
  qty: number;
  side: Side;
  printFileUrl: string; // URL to your print-ready PNG
}

export interface CreateOrderParams {
  external_id: string; // e.g. Stripe session id
  recipient: Recipient;
  items: LineItem[];
  // demo: keep draft
  confirm?: boolean; // default false
}

// ---- Variant mapping: REPLACE with your real IDs ----
// Example: Unisex Tee (e.g. Gildan 64000/3001 or similar). Use your actual catalog variant IDs.
const VARIANTS: Record<Material, Record<Color, Record<string, number>>> = {
  standard: {
    white: { S: 11576, M: 11577, L: 11578, XL: 11579, XXL: 11580 },
    black: { S: 11561, M: 11547, L: 11548, XL: 11549, XXL:  11550 },
    navy: { S: 11561, M: 11562, L: 11563, XL: 11564, XXL: 11565 },
  },
  eco: {
    white: { XS: 19393, S: 19396, M: 19399, L: 19402, XL: 19405, XXL: 19408 },
    black: { XS: 19391, S: 19394, M: 19397, L: 19400, XL: 19403, XXL: 19406 },
    navy: { XS: 19392, S: 19395, M: 19398, L: 19401, XL: 19404, XXL: 19407 },
  },
  premium: {
    white: { S: 11864, M: 11865, L: 11866, XL: 11867, XXL: 11868 },
    black: { S: 11869, M: 11870, L: 11871, XL: 11872, XXL: 11873 },
    navy: { S: 11879, M: 11880, L: 11881, XL: 11882, XXL: 11883 },
  },
};

export function getVariantId(material: Material, color: Color, size: string): number | null {
  const m = VARIANTS[material];
  const c = m?.[color];
  const id = c?.[size];
  return typeof id === "number" ? id : null;
}

// ---- Minimal Printful client ----
type PrintfulCreateOrderResponse = {
  code: number;
  result?: { id?: number; external_id?: string };
  error?: { reason?: string; message?: string };
};

const PRINTFUL_API = "https://api.printful.com";

export async function createPrintfulDraftOrder(params: CreateOrderParams): Promise<{
  ok: boolean;
  orderId?: number;
  error?: string;
}> {
  const token = process.env.PRINTFUL_API_KEY;
  if (!token) return { ok: false, error: "PRINTFUL_API_KEY missing" };

  // Build Printful items from our LineItem(s)
  const items = params.items.map((li) => {
    const variant_id = getVariantId(li.material, li.color, li.size);
    return {
      variant_id, // required
      quantity: li.qty,
      // Files: provide print file + placement (front/back). Fallback to "default".
      files: [
        {
          type: li.side === "back" ? "back" : "front", // placement hint per Printful guidance
          url: li.printFileUrl,
          // position with placement is backward-compatible across API notes
          position: { placement: li.side },
        },
      ],
    };
  });

  if (items.some((i) => !i.variant_id)) {
    return { ok: false, error: "Missing variant_id mapping. Update lib/printful.ts VARIANTS." };
  }

  const body = {
    external_id: params.external_id,
    recipient: params.recipient,
    items,
    // keep as draft in demos
    confirm: params.confirm === true ? true : false,
  };

  const res = await fetch(`${PRINTFUL_API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Printful tokens are now OAuth-style tokens used as Bearer in header
      // (Private tokens for single-store projects). 
      // Docs: Developers portal & migration notes.
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as PrintfulCreateOrderResponse;

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      `Printful error ${data?.code || res.status}: ${res.statusText}`;
    return { ok: false, error: msg };
  }

  return { ok: true, orderId: data.result?.id };
}