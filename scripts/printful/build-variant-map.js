// Node 18+ (global fetch). Usage:
// PRINTFUL_API_KEY=xxxx node scripts/printful/build-variant-map.js --product 438 --colors white,black,navy --sizes XS,S,M,L,XL,XXL --material standard

const PRODUCT_ARG = "--product";
const COLORS_ARG = "--colors";
const SIZES_ARG = "--sizes";
const MATERIAL_ARG = "--material";

const args = process.argv.slice(2);
function getArg(flag, def = "") {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] || "").trim() : def;
}

const API = process.env.PRINTFUL_API_KEY;
if (!API) throw new Error("PRINTFUL_API_KEY env var is required");

const productId = getArg(PRODUCT_ARG);
if (!productId) throw new Error("Pass --product <id> (e.g., 438 for Gildan 5000)");

const colors = (getArg(COLORS_ARG, "white,black,navy")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean));

const sizes = (getArg(SIZES_ARG, "XS,S,M,L,XL,XXL")
  .split(",")
  .map(s => s.trim().toUpperCase())
  .filter(Boolean));

const material = getArg(MATERIAL_ARG, "standard");

const PF = "https://api.printful.com";

async function pf(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API}` },
    cache: "no-store",
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { result: null, raw: text }; }
  if (!res.ok) {
    throw new Error(`Printful ${res.status}: ${text}`);
  }
  return data.result;
}

function normColorName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

(async () => {
  const product = await pf(`${PF}/products/${productId}`);
  const variants = product?.variants || [];

  // Build color->size->id
  const out = {};
  for (const c of colors) {
    out[c] = {};
    for (const sz of sizes) out[c][sz] = 0;
  }

  for (const v of variants) {
    const id = v.id;
    const colorLabel = normColorName(v.color); // e.g., "Navy" -> "navy"
    const sizeLabel = (v.size || "").toUpperCase();

    const cKey = colors.find(c => normColorName(c) === colorLabel);
    if (!cKey) continue;
    if (!sizes.includes(sizeLabel)) continue;

    out[cKey][sizeLabel] = id;
  }

  // Emit TS snippet
  const lines = [];
  lines.push(`// Auto-generated for product ${productId}`);
  lines.push(`const VARIANTS: Record<MaterialKey, Record<ColorKey, Record<SizeKey, number>>> = {`);
  lines.push(`  ${material}: {`);
  for (const c of colors) {
    const entries = sizes.map(sz => `${sz}: ${out[c][sz] || 0}`).join(", ");
    lines.push(`    ${c}: { ${entries} },`);
  }
  lines.push(`  },`);
  lines.push(`  eco: { white: { ${sizes.map(s=>`${s}: 0`).join(", ")} }, black: { ${sizes.map(s=>`${s}: 0`).join(", ")} }, navy: { ${sizes.map(s=>`${s}: 0`).join(", ")} } },`);
  lines.push(`  premium: { white: { ${sizes.map(s=>`${s}: 0`).join(", ")} }, black: { ${sizes.map(s=>`${s}: 0`).join(", ")} }, navy: { ${sizes.map(s=>`${s}: 0`).join(", ")} } },`);
  lines.push(`};`);
  console.log(lines.join("\n"));

  // Warn about any zeros
  const missing = [];
  for (const c of colors) for (const sz of sizes) if (!out[c][sz]) missing.push(`${c}/${sz}`);
  if (missing.length) {
    console.warn(`\n⚠️ Missing IDs for: ${missing.join(", ")}`);
    console.warn(`They may be unavailable for this product/color/size. That's ok—those combos won’t be selectable.`);
  }
})();