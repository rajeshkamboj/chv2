import { SITE } from "@/lib/constants";
import { routes } from "@/lib/routes";
import {
  getCategoryService,
  getCollectionService,
  getProductService,
} from "@/lib/services";

export const revalidate = 3_600;
const PRODUCT_CHUNK_SIZE = 48;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(
  url: string,
  options: { lastModified?: string; priority?: number; changeFrequency?: string } = {},
): string {
  return [
    "<url>",
    `<loc>${xmlEscape(url)}</loc>`,
    options.lastModified ? `<lastmod>${xmlEscape(options.lastModified)}</lastmod>` : "",
    options.changeFrequency ? `<changefreq>${options.changeFrequency}</changefreq>` : "",
    options.priority !== undefined ? `<priority>${options.priority}</priority>` : "",
    "</url>",
  ].filter(Boolean).join("\n");
}

function xmlResponse(entries: string[]): Response {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

/** Serve one bounded sitemap chunk. Chunk 0 is static/taxonomy; 1..N are products. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const rawId = (await params).id;
  if (!/^\d+$/.test(rawId)) {
    return new Response("Not found", { status: 404 });
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) {
    return new Response("Not found", { status: 404 });
  }

  if (id === 0) {
    const [categories, collections] = await Promise.all([
      getCategoryService().listCategories(),
      getCollectionService().listCollections(),
    ]);
    return xmlResponse([
      urlEntry(SITE.url, { changeFrequency: "daily", priority: 1 }),
      ...categories.map((category) =>
        urlEntry(`${SITE.url}${routes.category(category.slug)}`, {
          changeFrequency: "weekly",
          priority: 0.7,
        }),
      ),
      ...collections.map((collection) =>
        urlEntry(`${SITE.url}${routes.collection(collection.slug)}`, {
          changeFrequency: "weekly",
          priority: 0.7,
        }),
      ),
    ]);
  }

  const { items } = await getProductService().getSitemapBatch(id, PRODUCT_CHUNK_SIZE);
  return xmlResponse(items.map((product) =>
    urlEntry(product.canonicalUrl || `${SITE.url}${routes.product(product.slug)}`, {
      lastModified: product.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  ));
}
