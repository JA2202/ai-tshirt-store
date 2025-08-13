// lib/printful.ts
export type Side = "front" | "back";
export type Color = "white" | "black" | "heather";
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
    white: { XS: 4011, S: 4012, M: 4013, L: 4014, XL: 4015, XXL: 4016 },
    black: { XS: 4021, S: 4022, M: 4023, L: 4024, XL: 4025, XXL: 4026 },
    heather: { XS: 4031, S: 4032, M: 4033, L: 4034, XL: 4035, XXL: 4036 },
  },
  eco: {
    white: { XS: 5011, S: 5012, M: 5013, L: 5014, XL: 5015, XXL: 5016 },
    black: { XS: 5021, S: 5022, M: 5023, L: 5024, XL: 5025, XXL: 5026 },
    heather: { XS: 5031, S: 5032, M: 5033, L: 5034, XL: 5035, XXL: 5036 },
  },
  premium: {
    white: { XS: 6011, S: 6012, M: 6013, L: 6014, XL: 6015, XXL: 6016 },
    black: { XS: 6021, S: 6022, M: 6023, L: 6024, XL: 6025, XXL: 6026 },
    heather: { XS: 6031, S: 6032, M: 6033, L: 6034, XL: 6035, XXL: 6036 },
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