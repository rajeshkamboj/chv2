import type { ID, ISODateString, Money, Slug } from "./common";
import type { LicenseCode } from "./license";

export type ProductStatus = "active" | "draft" | "archived";

/** Top-level groups from the centralized taxonomy (`lib/taxonomy.ts`). */
export type ProductGroupSlug =
  | "vector-creatives"
  | "character-bundle"
  | "freebies";

/** Product format: individual creative, multi-asset bundle, or freebie. */
export type ProductKind = "vector" | "bundle" | "freebie";

export interface ProductImage {
  id: ID;
  /** CDN URL. Empty while running on mock data (see `placeholder`). */
  url: string;
  alt: string;
  width?: number;
  height?: number;
  /**
   * Deterministic flat placeholder used until real CDN imagery exists.
   * `hue` is 0–360; the card renders a flat swatch + monogram (no gradients).
   */
  placeholder?: {
    hue: number;
    label: string;
  };
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export interface ProductVendor {
  id: ID;
  name: string;
}

export interface Product {
  id: ID;
  slug: Slug;
  title: string;
  subtitle?: string;
  shortDescription?: string;
  description?: string;

  /** Existing WordPress/Yoast overrides, when the catalogue API provides them. */
  seo?: {
    title?: string;
    description?: string;
    canonicalUrl?: string;
  };

  /** Base price (personal license) in minor units. */
  price: Money;
  /** Original price when on sale; absent otherwise. */
  compareAtPrice?: Money;

  status: ProductStatus;
  /** Top-level taxonomy group (see `lib/taxonomy.ts`). */
  productGroup: ProductGroupSlug;
  /** Product format — metadata varies by kind. */
  kind: ProductKind;
  categoryIds: ID[];
  /**
   * Denormalised slugs, most-specific first (subcategory, then group),
   * so cards can link without extra lookups.
   */
  categorySlugs: Slug[];
  tags: string[];
  /** SEO/discovery keywords (superset of tags). */
  keywords: string[];
  /** Included file extensions, e.g. `["AI", "EPS", "PNG"]`. */
  fileTypes: string[];
  /** Human-readable deliverables, e.g. `["AI source files", …]`. */
  fileIncluded: string[];
  /** Total download size in bytes. */
  fileSizeBytes?: number;
  /** Compatible apps, e.g. `["Adobe Illustrator CC+"]`. */
  compatibleWith: string[];
  /** Help/documentation URL for the product files. */
  documentationUrl?: string;
  images: ProductImage[];
  attributes: ProductAttribute[];

  ratingAverage: number;
  ratingCount: number;
  salesCount: number;

  featured: boolean;
  bestseller: boolean;
  isNew: boolean;
  /** Free product (`price.amount === 0`). */
  isFree: boolean;
  /** Alias of `featured` for the product-page contract. */
  isFeatured: boolean;
  /** On sale (`compareAtPrice` present and higher). */
  isSale: boolean;
  /** Editable template (text, colours, layout). */
  isCustomizable: boolean;

  /** License codes available for this product. */
  licenses: LicenseCode[];
  vendor?: ProductVendor;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}
