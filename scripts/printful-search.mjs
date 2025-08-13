// scripts/printful-search.mjs
/* Usage:
   node scripts/printful-search.mjs "bella canvas 3001"
*/
const token = process.env.PRINTFUL_API_KEY;
if (!token) {
  console.error("PRINTFUL_API_KEY is not set");
  process.exit(1);
}
const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("Pass a search term. Example: node scripts/printful-search.mjs \"gildan 5000\"");
  process.exit(1);
}

const url = new URL("https://api.printful.com/products");
url.searchParams.set("search", query);

const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error("Search failed:", res.status, await res.text());
  process.exit(1);
}
const json = await res.json();
const list = json?.result || [];
if (!list.length) {
  console.log("No products found.");
  process.exit(0);
}

console.log(`Found ${list.length} products for "${query}":`);
for (const p of list) {
  console.log(`- ${p.id}: ${p.brand} ${p.model} — ${p.type}`);
}
console.log("\nPick an ID and run: node scripts/printful-variants.mjs <PRODUCT_ID> --label=standard");