import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadSource(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const media = await loadSource("../lib/creative-hatti/media.ts");
const adapters = await loadSource("../lib/creative-hatti/adapters.ts", [['"./media"', JSON.stringify(media)]]);
const search = await import(await loadSource("../lib/creative-hatti/search.ts", [['"./adapters"', JSON.stringify(adapters)]]));
const { apiFetch, ApiError } = await import(await loadSource("../lib/api/client.ts"));

test("indexed search forwards the query, every filter and sort without losing multiselect values", () => {
  assert.deepEqual(search.searchRequestParams({
    query: "  Diwali vector  ", page: 2, pageSize: 24, sort: "price-asc",
    filters: { groups: ["character-bundle", "vector-creatives"], categorySlugs: ["miscellaneous", "profession"],
      priceMin: 19900, priceMax: 99900, availability: "paid", ratingMin: 4, fileTypes: ["EPS", "PNG"],
      compatibleWith: ["illustrator", "photoshop"], collection: "diwali", licenses: ["commercial"], onSale: true },
  }), {
    q: "Diwali vector", page: 2, per_page: 24, sort: "price-asc", group: "character-bundles,vector-creatives",
    cat: "miscellaneous-character-bundles,profession", min: 19900, max: 99900, avail: "paid", rating: 4,
    file: "EPS,PNG", app: "illustrator,photoshop", collection: "diwali", license: "commercial", sale: true,
  });
});

test("browse mode has no accidental filters and category facets preserve server counts", () => {
  const request = search.searchRequestParams({ query: "" });
  assert.equal(request.q, "");
  assert.equal(request.sort, "relevance");
  assert.equal(request.cat, undefined);
  const facets = [{ key: "category", label: "Category", values: [{ value: "character-bundles", label: "Character Bundles", count: 123 }] }];
  assert.equal(search.searchFacetsFromApi(facets)[0].values[0].value, "character-bundle");
  assert.equal(search.searchFacetsFromApi(facets)[0].values[0].count, 123);
  assert.equal(facets[0].values[0].value, "character-bundles");
});

test("API client safely encodes query punctuation and propagates index failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.CH_API_URL;
  process.env.CH_API_URL = "http://catalogue.test/wp-json/ch/v1";
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      assert.equal(url.pathname, "/wp-json/ch/v1/indexed-search");
      assert.equal(url.searchParams.get("q"), "diwali & lights");
      return new Response(JSON.stringify({ code: "search_not_ready", message: "Index pending" }), { status: 503 });
    };
    await assert.rejects(apiFetch("/indexed-search", { searchParams: { q: "diwali & lights" } }),
      (error) => error instanceof ApiError && error.status === 503 && error.code === "search_not_ready");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.CH_API_URL;
    else process.env.CH_API_URL = originalUrl;
  }
});
