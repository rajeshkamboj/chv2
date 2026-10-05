import type { NextConfig } from "next";
import legacyProductRedirects from "./data/legacy-product-redirects.json";
console.log(">>> CREATIVE HATTI NEXT CONFIG LOADED <<<");

const nextConfig: NextConfig = {
  reactStrictMode: true,
images: {
  remotePatterns: [
    { protocol: "https", hostname: "creativehatti.test", pathname: "/wp-content/uploads/**" },
    { protocol: "https", hostname: "www.creativehatti.test", pathname: "/wp-content/uploads/**" },
    { protocol: "https", hostname: "api.creativehatti.com", pathname: "/wp-content/uploads/**" },
    // Local WordPress during development
    {
      protocol: "http",
      hostname: "creativehatti.test",
      pathname: "/wp-content/uploads/**",
    },
    {
      protocol: "http",
      hostname: "www.creativehatti.test",
      pathname: "/wp-content/uploads/**",
    },

    // Production WordPress media
    {
      protocol: "https",
      hostname: "www.creativehatti.com",
      pathname: "/wp-content/uploads/**",
    },
    {
      protocol: "https",
      hostname: "creativehatti.com",
      pathname: "/wp-content/uploads/**",
    },

    // CDN
    {
      protocol: "https",
      hostname: "cdn.creativehatti.com",
      pathname: "/**",
    },
  ],
},
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // No X-Frame-Options here: framing policy ships as `frame-ancestors`
      // at the edge/CDN in production (this app also runs embedded in
      // authenticated preview shells during development).
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    // HSTS only in production — never on local http.
    if (process.env.NODE_ENV === "production") {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [{ source: "/:path*", headers: security }];
  },
  async rewrites() {
    return [
      { source: "/sitemap/:id.xml", destination: "/sitemap/:id" },
    ];
  },
  async redirects() {
    return [
      ...Object.entries(legacyProductRedirects).map(([oldSlug, newSlug]) => ({
        source: `/product/${oldSlug}`,
        destination: `/product/${newSlug}`,
        permanent: true,
      })),
      ...Object.entries(legacyProductRedirects).map(([oldSlug, newSlug]) => ({
        source: `/products/${oldSlug}`,
        destination: `/product/${newSlug}`,
        permanent: true,
      })),
      ...Object.entries(legacyProductRedirects).map(([oldSlug, newSlug]) => ({
        source: `/downloads/${oldSlug}`,
        destination: `/product/${newSlug}`,
        permanent: true,
      })),
      // EDD's current WordPress permalink base is /downloads/:slug/.
      // Preserve current slugs as well as the exact historical aliases above.
      {
        source: "/downloads/:slug",
        destination: "/product/:slug",
        permanent: true,
      },
      // Canonical category URLs live at /category/[slug]; keep the legacy
      // plural prefix working for any shared/bookmarked links.
      {
        source: "/categories/:slug",
        destination: "/category/:slug",
        permanent: true,
      },
      // Product pages moved to the singular /product/[slug] (RUN 07);
      // keep the old plural prefix working for shared links.
      {
        source: "/products/:slug",
        destination: "/product/:slug",
        permanent: true,
      },
      // Bare plural prefixes: the catalogue browse surface is /search
      // and category discovery lives on the homepage.
      {
        source: "/products",
        destination: "/search",
        permanent: true,
      },
      {
        source: "/categories",
        destination: "/",
        permanent: true,
      },
      // The wishlist is account-scoped; guests bounce to login.
      {
        source: "/wishlist",
        destination: "/account/wishlist",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
