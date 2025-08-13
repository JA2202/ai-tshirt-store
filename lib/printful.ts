// lib/printful.ts
const PRINTFUL_API = "https://api.printful.com";

/** Ensure required env var exists. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

const API_KEY = required("PRINTFUL_API_KEY");
const STORE_ID = required("PRINTFUL_STORE_ID");

/** Recipient we send to Printful. */
export type PFRecipient = {
  name: string;
  address1: string;
  city: string;
  state_code?: string;
  country_code: string;
  zip: string;
  phone?: string;
  email?: string;
};

/** Printful order item. */
export type PFItem = {
  quantity: number;
  variant_id: number; // Printful catalog variant ID
  files: Array<{
    url: string;
    type?: "default" | "preview";
    position?: "front" | "back";
  }>;
};

type PFOrderCreateBody = {
  external_id: string;
  recipient: PFRecipient;
  items: PFItem[];
  confirm?: boolean; // false => draft
  retail_costs?: {
    currency: string; // e.g. "GBP"
  };
};

async function pfFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${PRINTFUL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
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
      `Printful ${res.status} ${res.statusText}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }
  return data as T;
}

/** 👉 Named export (used by the webhook) */
export async function createDraftOrder(body: PFOrderCreateBody) {
  // visible in Vercel Function logs while testing
  console.log("Creating Printful order at", `/stores/${STORE_ID}/orders`);
  return pfFetch<{ result: { id: number } }>(`/stores/${STORE_ID}/orders`, {
    method: "POST",
    body: JSON.stringify({ ...body, confirm: false }),
  });
}

/* ------------------ Variant map (replace IDs) ------------------ */
export type ColorKey = "white" | "black" | "heather";
export type SizeKey = "XS" | "S" | "M" | "L" | "XL" | "XXL";
export type MaterialKey = "standard" | "eco" | "premium";

/** PLACEHOLDERS — replace with your real Printful catalog variant_ids */
const VARIANTS: Record<
  MaterialKey,
  Record<ColorKey, Record<SizeKey, number>>
> = {
  standard: {
    white: { XS: 123456, S: 123457, M: 123458, L: 123459, XL: 123460, XXL: 123461 },
    black:  { XS: 123462, S: 123463, M: 123464, L: 123465, XL: 123466, XXL: 123467 },
    heather:{ XS: 123468, S: 123469, M: 123470, L: 123471, XL: 123472, XXL: 123473 },
  },
  eco: {
    white: { XS: 223456, S: 223457, M: 223458, L: 223459, XL: 223460, XXL: 223461 },
    black:  { XS: 223462, S: 223463, M: 223464, L: 223465, XL: 223466, XXL: 223467 },
    heather:{ XS: 223468, S: 223469, M: 223470, L: 223471, XL: 223472, XXL: 223473 },
  },
  premium: {
    white: { XS: 323456, S: 323457, M: 323458, L: 323459, XL: 323460, XXL: 323461 },
    black:  { XS: 323462, S: 323463, M: 323464, L: 323465, XL: 323466, XXL: 323467 },
    heather:{ XS: 323468, S: 323469, M: 323470, L: 323471, XL: 323472, XXL: 323473 },
  },
};

/** 👉 Named export (used by the webhook) */
export function resolveVariantId(
  material: MaterialKey,
  color: ColorKey,
  size: SizeKey
): number {
  const id = VARIANTS?.[material]?.[color]?.[size];
  if (!id) {
    throw new Error(
      `No Printful variant id for ${material}/${color}/${size}. Update VARIANTS in lib/printful.ts.`
    );
  }
  return id;
}