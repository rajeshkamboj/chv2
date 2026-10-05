import { SITE } from "@/lib/constants";
import { getProductService } from "@/lib/services";

export const revalidate = 3_600;
const PRODUCT_CHUNK_SIZE = 48;

/** Sitemap index covering the static/taxonomy chunk and every product chunk. */
export async function GET(): Promise<Response> {
  const catalog = await getProductService().getSitemapBatch(1, 1);
  const productChunks = Math.ceil(catalog.total / PRODUCT_CHUNK_SIZE);
  const ids = Array.from({ length: productChunks + 1 }, (_, id) => id);
  const entries = ids
    .map(
      (id) =>
        `  <sitemap><loc>${SITE.url}/sitemap/${id}.xml</loc></sitemap>`,
    )
    .join("\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</sitemapindex>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
