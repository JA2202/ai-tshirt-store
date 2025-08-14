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
    white:  { XS: 0, S: 19396, M: 19399, L: 19402, XL: 19405, XXL: 19408 },     // fill with real ids if you add eco tees
    black:  { XS: 0, S: 19394, M: 19397, L: 19400, XL: 19403, XXL: 19406 },
    navy:   { XS: 0, S: 19395, M: 19398, L: 19401, XL: 19404, XXL: 19407 },
  },
  premium: {
    white:  { XS: 0, S: 11864, M: 11865, L: 11866, XL: 11867, XXL: 11868 },
    black:  { XS: 0, S: 11869, M: 11870, L: 11871, XL: 11872, XXL: 11873 },
    navy:   { XS: 0, S: 11879, M: 11880, L: 11881, XL: 11882, XXL: 11883 },
  },
};

export function resolveVariantId(material: MaterialKey, color: ColorKey, size: SizeKey): number {
  const id = VARIANTS?.[material]?.[color]?.[size];
  if (!id) {
    throw new Error(`No Printful variant id for ${material}/${color}/${size}. Update VARIANTS in lib/printful.ts.`);
  }
  return id;
}

// --- Add to lib/printful.ts (keep your existing code above) ---

export type PFV2Order = {
  id: number;
  external_id?: string;
  status?: string;
  _links?: { self?: { href?: string } };
};

export async function getOrderByExternalId(
  externalId: string
): Promise<PFV2Order | null> {
  // v2 supports filtering by external_id
  try {
    const data = await pfFetchV2<{ items?: PFV2Order[] }>(
      `/orders?external_id=${encodeURIComponent(externalId)}`,
      { method: "GET" }
    );
    if (Array.isArray(data?.items) && data.items.length > 0) {
      return data.items[0]!;
    }
    return null;
  } catch {
    return null;
  }
}

// Optional helper to build a dashboard URL for investors
export const PRINTFUL_STORE_ID = STORE_ID;
export function printfulDashboardOrderUrl(orderId: number) {
  return `https://www.printful.com/dashboard/store/${STORE_ID}/orders/${orderId}`;
}