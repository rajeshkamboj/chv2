import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";

/**
 * Crawl policy: the catalogue is public; sessions, carts, checkout,
 * accounts and APIs stay out of the index (and out of crawl budget).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/cart",
          "/checkout",
          "/account",
          "/wishlist",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
