import assert from "node:assert/strict";
import test from "node:test";

// Explicit opt-in: this suite reads a real index; it never writes catalogue data.
const base = (process.env.SEARCH_TEST_API_URL ?? process.env.CH_API_URL)?.replace(/\/$/, "");
async function search(params) {
  const response = await fetch(`${base}/indexed-search?${new URLSearchParams(params)}`);
  const data = await response.json();
  return { response, data };
}
test("real catalogue: keyword, prefix, multiselect, prices, facets, sorting and paging", { skip: !base }, async () => {
  const { response, data: first } = await search({ q: "diwali", per_page: "5" });
  assert.equal(response.status, 200);
  assert.equal(first.success, true);
  assert.ok(first.pagination.total > 5);
  assert.equal(first.data.length, 5);
  assert.ok(first.facets.some((facet) => facet.key === "category" && facet.values.length));
  assert.ok(first.data.every((item) => item.id && item.slug && item.price.currency));
  const { data: second } = await search({ q: "diwali", per_page: "5", page: "2" });
  assert.equal(second.pagination.total, first.pagination.total);
  assert.equal(second.pagination.page, 2);
  assert.ok(second.data.every((item) => !first.data.some((other) => other.id === item.id)));
  const { data: repeat } = await search({ q: "diwali", per_page: "5" });
  assert.deepEqual(repeat.data.map((item) => item.id), first.data.map((item) => item.id));
  const { data: prefix } = await search({ q: "diwal", per_page: "5" });
  assert.equal(prefix.pagination.total, first.pagination.total);
  const { data: missing } = await search({ q: "zzunlikelycatalogueword" });
  assert.equal(missing.pagination.total, 0);
  assert.deepEqual(missing.data, []);
  const { data: constrained } = await search({ q: "diwali", min: "100", max: "50000", avail: "paid", sort: "price-asc", per_page: "48" });
  const prices = constrained.data.map((item) => item.price.amount * 100);
  assert.ok(prices.length);
  assert.ok(prices.every((price) => price >= 100 && price <= 50000));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const cats = first.facets.find((facet) => facet.key === "category").values.slice(0, 2).map((value) => value.value);
  const { data: filtered } = await search({ q: "diwali", cat: cats.join(",") });
  assert.ok(filtered.pagination.total > 0 && filtered.pagination.total <= first.pagination.total);
  const { data: collection } = await search({ collection: "diwali", per_page: "5" });
  assert.equal(collection.pagination.total, first.pagination.total);
  const { data: short } = await search({ q: "AI", file: "AI,EPS" });
  assert.ok(short.pagination.total > 0);
  const { data: all } = await search({ per_page: "1" });
  assert.ok(all.pagination.total > 40000, `Only ${all.pagination.total} indexed products`);
  assert.equal(all.data.length, 1);
  console.log(`Catalogue ${all.pagination.total}; Diwali ${first.pagination.total}; keyword query ${first.took_ms}ms`);
});

test("real API rejects invalid and oversized input", { skip: !base }, async () => {
  for (const params of [
    { per_page: "10000" }, { page: "-1" }, { q: "x".repeat(161) }, { q: "!" },
    { cat: Array(9).fill("festival").join(",") }, { sort: "arbitrary-sql" },
    { min: "99900", max: "100" }, { collection: "missing-collection" }, { min: "NaN" },
  ]) {
    const { response } = await search(params);
    assert.equal(response.status, 400, JSON.stringify(params));
  }
});

test("bounded concurrent query timing sample", { skip: !base }, async () => {
  const queries = ["diwali", "holi", "logo", "vector", "illustrator", "AI", "republic day", "ganesh", "navratri", "diwal", "profession", "bollywood"];
  const timings = [];
  for (let offset = 0; offset < queries.length; offset += 3) {
    await Promise.all(queries.slice(offset, offset + 3).map(async (q) => {
      const started = performance.now();
      const { response, data } = await search({ q, per_page: "24" });
      assert.equal(response.status, 200);
      assert.ok(data.data.length <= 24);
      timings.push({ q, http: performance.now() - started, index: data.took_ms });
    }));
  }
  const percentile = (key, p) => [...timings].sort((a, b) => a[key] - b[key])[Math.ceil(timings.length * p) - 1][key];
  console.log(`Local sample, 3 concurrent reads: index p50 ${percentile("index", 0.5)}ms / p95 ${percentile("index", 0.95)}ms; HTTP p95 ${Math.round(percentile("http", 0.95))}ms`);
  console.log(`Slowest index queries: ${[...timings].sort((a, b) => b.index - a.index).slice(0, 3).map((item) => `${item.q} ${item.index}ms`).join(", ")}`);
});

const storefront = process.env.SEARCH_TEST_STOREFRONT_URL?.replace(/\/$/, "");
test("Next.js search renders the indexed API results", { skip: !base || !storefront }, async () => {
  const { data } = await search({ q: "diwali", per_page: "5" });
  const response = await fetch(`${storefront}/search?q=diwali`);
  const html = await response.text();
  assert.equal(response.status, 200);
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.match(markup, /Results for/);
  assert.ok(!markup.includes("Search is temporarily unavailable"));
  assert.ok(data.data.every((item) => markup.includes(`/product/${item.slug}`)));
  // App Router streaming includes the loading status before the completed status.
  const statuses = [...markup.matchAll(/<p\b[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/g)];
  assert.ok(statuses.some((match) => match[1].replace(/<!--[\s\S]*?-->|<[^>]+>/g, "").includes(String(data.pagination.total))));
});
