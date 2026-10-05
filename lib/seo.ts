import { SITE } from "./constants";
import { routes } from "./routes";
import type { Category, Collection, Product } from "./types";

/**
 * SEO builders — pure functions (server-safe, no client JS).
 * Every value is composed from real catalogue data; nothing is invented
 * for crawlers that a shopper can't also see on the page.
 */

export function absoluteUrl(path: string): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export function productCanonical(product: Pick<Product, "slug">): string {
  return absoluteUrl(routes.product(product.slug));
}

/** Prefer a migrated Yoast override; otherwise use the Next.js route. */
export function productSeoCanonical(
  product: Pick<Product, "slug" | "seo">,
): string {
  return product.seo?.canonicalUrl || productCanonical(product);
}

/**
 * Meta-description fallback chain: editorial short description first,
 * then a description composed from real fields (category, formats,
 * price). Never empty, never invented.
 */
export function productMetaDescription(product: Product): string {
  if (product.seo?.description) return product.seo.description;
  if (product.shortDescription) return product.shortDescription;
  if (product.description) return product.description;
  const formats = product.fileTypes.slice(0, 4).join("/");
  const price = `₹${(product.price.amount / 100).toLocaleString("en-IN")}`;
  return [
    `${product.title} — an Indian creative asset on ${SITE.name}.`,
    formats ? `Includes ${formats} files.` : "",
    product.isFree ? "Free download." : `From ${price}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function productMetaTitle(product: Product): string {
  return product.seo?.title || product.title;
}

export function categoryMetaTitle(category: Category): string {
  return category.seo?.title || category.name;
}

export function categoryMetaDescription(category: Category): string {
  return (
    category.seo?.description ||
    category.description ||
    `${category.name} — Indian vectors, characters and creative assets on ${SITE.name}.`
  );
}

export function categoryCanonical(category: Pick<Category, "slug" | "seo">): string {
  return category.seo?.canonicalUrl || absoluteUrl(routes.category(category.slug));
}

/** Breadcrumb trail items for JSON-LD (paths resolve via `absoluteUrl`). */
export interface BreadcrumbTrailItem {
  name: string;
  /** Omitted for the current page (no URL on the last item). */
  path?: string;
}

export function breadcrumbJsonLd(
  items: BreadcrumbTrailItem[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path) } : {}),
    })),
  };
}

export interface ProductJsonLdOptions {
  /** Most-specific category display name for the `category` property. */
  categoryName?: string;
}

export function productJsonLd(
  product: Product,
  options: ProductJsonLdOptions = {},
): Record<string, unknown> {
  const images = product.images.map((image) => image.url).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: productMetaDescription(product),
    url: productSeoCanonical(product),
    ...(images.length > 0 ? { image: images } : {}),
    ...(options.categoryName ? { category: options.categoryName } : {}),
    brand: { "@type": "Brand", name: SITE.name },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAverage,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: productSeoCanonical(product),
      priceCurrency: product.price.currency,
      price: (product.price.amount / 100).toFixed(2),
      itemCondition: "https://schema.org/NewCondition",
      availability:
        product.status === "active"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
}

export function categoryPageTitle(category: Pick<Category, "name">): string {
  return category.name;
}

export function collectionPageTitle(
  collection: Pick<Collection, "title">,
): string {
  return `${collection.title} Collection`;
}

/** Organization + WebSite (+ SearchAction) for the homepage. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${absoluteUrl("/")}#organization`,
        name: SITE.name,
        url: absoluteUrl("/"),
        slogan: SITE.tagline,
      },
      {
        "@type": "WebSite",
        url: absoluteUrl("/"),
        name: SITE.name,
        publisher: { "@id": `${absoluteUrl("/")}#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
