// scripts/printful-variants.mjs
/* Usage examples:
   node scripts/printful-variants.mjs 1234 --label=standard
   node scripts/printful-variants.mjs 1234 --label=premium --colors=white,black,heather --sizes=XS,S,M,L,XL,XXL
*/
const token = process.env.PRINTFUL_API_KEY;
if (!token) {
  console.error("PRINTFUL_API_KEY is not set");
  process.exit(1);
}

const [productIdRaw, ...rest] = process.argv.slice(2);
if (!productIdRaw || isNaN(Number(productIdRaw))) {
  console.error("Pass a numeric PRODUCT_ID. Example: node scripts/printful-variants.mjs 1234");
  process.exit(1);
}
const productId = Number(productIdRaw);

// Parse args
const args = Object.fromEntries(
  rest
    .filter((s) => s.startsWith("--"))
    .map((s) => s.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"])
);
const label = (args.label || "standard").trim();
const colorFilter = (args.colors || "white,black,navy").split(",").map(s => s.trim().toLowerCase());
const sizeFilterRaw = (args.sizes || "XS,S,M,L,XL,XXL").split(",").map(s => s.trim().toUpperCase());

// Printful uses "2XL" not "XXL" sometimes; map both ways
const sizeNormalize = (s) => (s === "2XL" ? "XXL" : s);
const allowedSizes = new Set(sizeFilterRaw.map(sizeNormalize));

// Hit product details
const url = `https://api.printful.com/products/${productId}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error("Failed to fetch product:", res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const variants = data?.result?.variants || [];

function normalizeColor(name = "") {
  const n = name.toLowerCase();
  if (/\bwhite\b/.test(n)) return "white";
  if (/\bblack\b/.test(n)) return "black";
  // heather can be many names: "heather grey", "athletic navy", etc.
  if (/\bnavy\b/.test(n)) return "navy";
  return null; // ignore other colors for this demo
}

// Build map: color -> size -> variant_id
const map = { white: {}, black: {}, navy: {} };
for (const v of variants) {
  const color = normalizeColor(v.color || v.name || "");
  if (!color || !colorFilter.includes(color)) continue;

  // Some sizes are like "2XL" — normalize to "XXL"
  const size = sizeNormalize(String(v.size || v.name || "").toUpperCase());
  if (!allowedSizes.has(size)) continue;

  map[color][size] = v.id;
}

// Output TypeScript snippet
console.log(`// Paste into lib/printful.ts
const VARIANTS: Record<Material, Record<Color, Record<string, number>>> = {
  ${label}: {
    white: ${JSON.stringify(map.white, null, 2)},
    black: ${JSON.stringify(map.black, null, 2)},
    navy: ${JSON.stringify(map.navy, null, 2)},
  },
  // keep your other materials as-is or duplicate this block for them
};

// If you want to merge with existing VARIANTS, just copy the inner object for "${label}".
`);