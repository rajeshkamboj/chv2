import { products } from "@/data/products";
import { ApiError, apiFetch } from "@/lib/api/client";
import { apiEndpoints } from "@/lib/api/endpoints";
import { cacheTags, REVALIDATE_SECONDS } from "@/lib/cache";
import {
  apiCategorySlug,
  paginatedFromApi,
  productFromApi,
} from "@/lib/creative-hatti/adapters";
import type {
  ChApiEnvelope,
  ChApiProductCard,
  ChApiProductDetail,
  ChApiSitemapBatch,
} from "@/lib/creative-hatti/types";
import type {
  Paginated,
  PaginationParams,
  Product,
  Slug,
} from "@/lib/types";
import { normalizePaginationParams, paginateItems } from "@/lib/utils";

export type ProductSortKey =
  | "newest"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "title-asc"
  | "title-desc"
  | "rating"
  | "best-selling";

export interface ProductListParams extends PaginationParams {
  categorySlug?: Slug;
  tag?: string;
  onSale?: boolean;
  featured?: boolean;
  sort?: ProductSortKey;
}

export interface ProductService {
  listProducts(params?: ProductListParams): Promise<Paginated<Product>>;
  getProductBySlug(slug: Slug): Promise<Product | null>;
  listRelatedProducts(slug: Slug, limit?: number): Promise<Product[]>;
  listFeaturedProducts(limit?: number): Promise<Product[]>;
  listBestsellers(limit?: number): Promise<Product[]>;
  listNewArrivals(limit?: number): Promise<Product[]>;
  getSitemapBatch(page: number, pageSize: number): Promise<{
    total: number;
    items: Array<{ slug: string; updatedAt?: string; canonicalUrl?: string }>;
  }>;
}

/* ------------------------------ Mock ------------------------------ */

const SORT_FNS: Record<ProductSortKey, (a: Product, b: Product) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  "price-asc": (a, b) => a.price.amount - b.price.amount,
  "price-desc": (a, b) => b.price.amount - a.price.amount,
  "title-asc": (a, b) => a.title.localeCompare(b.title),
  "title-desc": (a, b) => b.title.localeCompare(a.title),
  rating: (a, b) =>
    b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount,
  "best-selling": (a, b) => b.salesCount - a.salesCount,
};

class MockProductService implements ProductService {
  async getSitemapBatch(page: number, pageSize: number) {
    const active = products.filter((product) => product.status === "active");
    const start = (page - 1) * pageSize;
    return {
      total: active.length,
      items: active.slice(start, start + pageSize).map((product) => ({
        slug: product.slug,
        updatedAt: product.updatedAt,
        canonicalUrl: product.seo?.canonicalUrl,
      })),
    };
  }

  async listProducts(
    params: ProductListParams = {},
  ): Promise<Paginated<Product>> {
    const { page, pageSize } = normalizePaginationParams(params);
    let items = products.filter((product) => product.status === "active");

    if (params.categorySlug) {
      items = items.filter((product) =>
        product.categorySlugs.includes(params.categorySlug as Slug),
      );
    }
    if (params.tag) {
      items = items.filter((product) => product.tags.includes(params.tag as string));
    }
    if (params.onSale) {
      items = items.filter((product) => product.compareAtPrice !== undefined);
    }
    if (params.featured) {
      items = items.filter((product) => product.featured);
    }

    const sort: ProductSortKey = params.sort ?? "best-selling";
    items = [...items].sort(SORT_FNS[sort]);

    return paginateItems(items, page, pageSize);
  }

  async getProductBySlug(slug: Slug): Promise<Product | null> {
    return products.find((product) => product.slug === slug) ?? null;
  }

  async listRelatedProducts(slug: Slug, limit = 8): Promise<Product[]> {
    const current = products.find((product) => product.slug === slug);
    if (!current) return [];
    const others = products.filter(
      (product) => product.slug !== slug && product.status === "active",
    );
    const primary = current.categorySlugs[0] ?? current.productGroup;
    const sameCategory = others.filter((product) =>
      product.categorySlugs.includes(primary),
    );
    const sameGroup = others.filter(
      (product) =>
        !product.categorySlugs.includes(primary) &&
        product.productGroup === current.productGroup,
    );
    const overlap = (product: Product): number =>
      product.tags.filter((tag) => current.tags.includes(tag)).length;
    const rest = others
      .filter((product) => product.productGroup !== current.productGroup)
      .sort(
        (a, b) => overlap(b) - overlap(a) || b.salesCount - a.salesCount,
      );
    return [...sameCategory, ...sameGroup, ...rest].slice(0, limit);
  }

  async listFeaturedProducts(limit = 8): Promise<Product[]> {
    return products.filter((product) => product.featured).slice(0, limit);
  }

  async listBestsellers(limit = 8): Promise<Product[]> {
    return [...products]
      .sort(SORT_FNS["best-selling"])
      .filter((product) => product.bestseller)
      .slice(0, limit);
  }

  async listNewArrivals(limit = 8): Promise<Product[]> {
    return [...products]
      .sort(SORT_FNS.newest)
      .filter((product) => product.isNew)
      .slice(0, limit);
  }
}

/* ------------------------------ API ------------------------------ */

class ApiProductService implements ProductService {
  async getSitemapBatch(page: number, pageSize: number) {
    const result = await apiFetch<ChApiEnvelope<ChApiSitemapBatch>>(
      apiEndpoints.products.sitemap,
      {
        searchParams: { page, per_page: pageSize },
        revalidate: REVALIDATE_SECONDS.catalog,
        tags: [cacheTags.products],
      },
    );
    return {
      total: result.data.total,
      items: result.data.items.map((item) => ({
        slug: item.slug,
        updatedAt: item.modified,
        canonicalUrl: item.canonical_url ?? undefined,
      })),
    };
  }

  async listProducts(params: ProductListParams = {}): Promise<Paginated<Product>> {
    const { page, pageSize } = normalizePaginationParams(params);
    const result = await apiFetch<ChApiEnvelope<ChApiProductCard[]>>(
      apiEndpoints.products.list,
      {
        searchParams: {
          page,
          per_page: pageSize,
          category: params.categorySlug
            ? apiCategorySlug(params.categorySlug)
            : undefined,
          featured: params.featured,
          orderby: params.sort === "oldest" ? "date" : undefined,
          order: params.sort === "oldest" ? "asc" : "desc",
        },
        revalidate: REVALIDATE_SECONDS.catalog,
        tags: [cacheTags.products],
      },
    );
    return paginatedFromApi(result, productFromApi);
  }

  async getProductBySlug(slug: Slug): Promise<Product | null> {
    try {
      const result = await apiFetch<ChApiEnvelope<ChApiProductDetail>>(
        apiEndpoints.products.detail(slug),
        {
          revalidate: REVALIDATE_SECONDS.product,
          tags: [cacheTags.product(slug)],
        },
      );
    return productFromApi(result.data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async listRelatedProducts(slug: Slug, limit = 8): Promise<Product[]> {
    const current = await this.getProductBySlug(slug);
    const categorySlug = current?.categorySlugs[0];
    if (!categorySlug) return [];
    const result = await this.listProducts({
      categorySlug,
      pageSize: limit + 1,
      sort: "newest",
    });
    return result.items
      .filter((product) => product.slug !== slug)
      .slice(0, limit);
  }

  async listFeaturedProducts(limit = 8): Promise<Product[]> {
    const result = await this.listProducts({
      featured: true,
      pageSize: limit,
    });
    return result.items;
  }

  async listBestsellers(limit = 8): Promise<Product[]> {
    const result = await this.listProducts({
      sort: "best-selling",
      pageSize: limit,
    });
    return result.items;
  }

  async listNewArrivals(limit = 8): Promise<Product[]> {
    const result = await this.listProducts({ sort: "newest", pageSize: limit });
    return result.items;
  }
}

/* --------------------------- Factory --------------------------- */

let cached: ProductService | null = null;

/** Pages and components consume products only through this accessor. */
export function getProductService(): ProductService {
  cached ??=
    process.env.USE_MOCK_API !== "true" && process.env.CH_API_URL
      ? new ApiProductService()
      : new MockProductService();
  return cached;
}
