// lib/printful.ts
const PRINTFUL_V2 = "https://api.printful.com/v2";

/** Env helpers */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

const API_KEY = required("PRINTFUL_API_KEY");     // Printful token (org/account-scoped is fine)
const STORE_ID = required("PRINTFUL_STORE_ID");   // e.g. 16603677

/** Recipient we send to Printful v2 */
export type PFRecipient = {
  name: string;
  address1: string;
  city: string;
  country_code: string; // e.g. "GB"
  zip: string;
  state_code?: string;
  phone?: string;
  email?: string;
};

export type PFV2Layer = {
  type: "file";
  url: string; // publicly reachable PNG
};

export type PFV2Placement = {
  placement: "front" | "back"; // DTG tees: front/back
  technique: "dtg";
  layers: PFV2Layer[];
};

export type PFV2OrderItem = {
  source: "catalog";
  catalog_variant_id: number; // Printful catalog variant id
  quantity: number;
  placements: PFV2Placement[];
};

export type PFV2OrderCreate = {
  external_id: string;
  recipient: PFRecipient;
  retail_costs?: { currency: string }; // e.g. "GBP"
  order_items: PFV2OrderItem[];
};

async function pfFetchV2<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${PRINTFUL_V2}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "X-PF-Store-Id": STORE_ID,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as text
  }

  if (!res.ok) {
    throw new Error(
      `Printful v2 ${res.status} ${res.statusText}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }
  const obj = data as { data: T };
  return obj.data ?? (data as T);
}

/** Create a DRAFT order in v2 (single call with order_items). */
export async function createDraftOrderV2(body: PFV2OrderCreate) {
  return pfFetchV2<{ id: number }>(`/orders`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* ------------------ Variant map (replace with YOUR catalog ids) ------------------ */
export type ColorKey = "white" | "black" | "navy";
export type SizeKey = "XS" | "S" | "M" | "L" | "XL" | "XXL";
export type MaterialKey = "standard" | "eco" | "premium";

/**
 * IMPORTANT: Fill these with real Printful catalog variant_ids you listed
 * via /products/{id}.variants (e.g., 11547 for Gildan 5000 Black / M).
*/

const VARIANTS: Record<MaterialKey, Record<ColorKey, Record<SizeKey, number>>> = {
  standard: {
    white:  { XS: 0, S: 11576, M: 11577, L: 11578, XL: 11579, XXL: 11580 }, // example placeholders
    black:  { XS: 0, S: 11546, M: 11547, L: 11548, XL: 11549, XXL: 11550 }, // example placeholders
    navy:   { XS: 0, S: 11561, M: 11562, L: 11563, XL: 11564, XXL: 11565 }, // <-- YOUR real Navy ids
  },
  eco: {
    white:  { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },     // fill with real ids if you add eco tees
    black:  { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
    navy:   { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
  },
  premium: {
    white:  { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
    black:  { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
    navy:   { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
  },
};

export function resolveVariantId(material: MaterialKey, color: ColorKey, size: SizeKey): number {
  const id = VARIANTS?.[material]?.[color]?.[size];
  if (!id) {
    throw new Error(`No Printful variant id for ${material}/${color}/${size}. Update VARIANTS in lib/printful.ts.`);
  }
  return id;
}