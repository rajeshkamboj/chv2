import { collections } from "@/data/collections";
import { apiFetch } from "@/lib/api/client";
import { apiEndpoints } from "@/lib/api/endpoints";
import { cacheTags, REVALIDATE_SECONDS } from "@/lib/cache";
import { collectionGridQuery, parseCollectionCards } from "@/lib/creative-hatti/collections";
import { normalizeWordPressMediaUrl } from "@/lib/creative-hatti/media";
import { getCategoryService } from "./categoryService";
import { routes } from "@/lib/routes";
import { getSearchService } from "./searchService";
import type { Product, ProductImage } from "@/lib/types";

export interface CollectionDirectoryEntry {
  slug: string;
  title: string;
  image?: ProductImage;
  query?: string;
  countLabel?: string;
  href?: string;
}
export interface CollectionDirectoryService {
  listEntries(): Promise<CollectionDirectoryEntry[]>;
  getPreview(): Promise<ProductImage | undefined>;
  getEntry(slug: string): Promise<CollectionDirectoryEntry | null>;
  listProducts(slug: string, page: number): Promise<{ products: Product[]; totalPages: number; total: number }>;
}
interface WordPressPage { slug: string; content: { rendered: string } }
interface WordPressMedia { id: number; source_url: string; alt_text: string; media_details?: { width?: number; height?: number } }
const cache = { revalidate: REVALIDATE_SECONDS.catalog, tags: [cacheTags.categories] };
const COUNT_CONCURRENCY = 4;
const MIN_COLLECTION_PRODUCT_COUNT = 10;
const COLLECTION_SEARCH_ALIASES: Record<string, string[]> = {
  "international-yoga-day": ["Yoga Day"],
  janmashtami: ["Janmashtami"],
  "krishna-janmashtami": ["Janmashtami"],
  // "international-nurses-day": ["Nurse Day", "Nurse"],
  "happy-mothers-day": ["Mother Day"],
  "mothers-day-graphics": ["Mother Day"],
  "ggs-prakash-divas": ["Guru Granth Sahib"],
  "granth-sahib": ["Guru Granth Sahib"],
  "instagram-banner": ["Instagram"],
  "instagram-banners": ["Instagram"],
  "sales-discount": ["Discount Bundles"],
};

function collectionSearchQueries(
  slug: string,
  title: string,
  pageQuery?: string,
): string[] {
  const curatedQuery = collections.find((entry) => entry.slug === slug)?.query;
  const aliases = COLLECTION_SEARCH_ALIASES[slug] ??
    COLLECTION_SEARCH_ALIASES[title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")] ??
    [];
  return [...new Set([...
    aliases,
    curatedQuery,
    pageQuery,
    title,
    slug.replace(/-/g, " "),
  ].map((query) => query?.trim()).filter((query): query is string => Boolean(query)))];
}

class MockCollectionDirectoryService implements CollectionDirectoryService {
  async listEntries() { return collections.map((c) => ({ slug: c.slug, title: c.title, image: c.coverImage, query: c.query })); }
  async getPreview() { return collections.find((c) => c.coverImage)?.coverImage; }
  async getEntry(slug: string) { return (await this.listEntries()).find((c) => c.slug === slug) ?? null; }
  async listProducts(slug: string, page: number) {
    const entry = await this.getEntry(slug);
    if (!entry) return { products: [], total: 0, totalPages: 0 };
    const result = await getSearchService().searchProducts({ query: entry.query, page, pageSize: 24 });
    return { products: result.items, total: result.pagination.totalItems, totalPages: result.pagination.totalPages };
  }
}

class WordPressCollectionDirectoryService implements CollectionDirectoryService {
  private async cards() {
    const pages = await apiFetch<WordPressPage[]>(apiEndpoints.wordpress.pages, {
      ...cache, wordpress: true, searchParams: { slug: "collections", per_page: 1, _fields: "slug,content" },
    });
    return parseCollectionCards(pages[0]?.content.rendered ?? "");
  }
  private async image(id: number): Promise<WordPressMedia> {
    return apiFetch<WordPressMedia>(apiEndpoints.wordpress.mediaDetail(id), {
      ...cache, wordpress: true, searchParams: { _fields: "id,source_url,alt_text,media_details.width,media_details.height" },
    });
  }
  private productImage(item: WordPressMedia): ProductImage {
    return { id: String(item.id), url: normalizeWordPressMediaUrl(item.source_url), alt: item.alt_text ?? "",
      width: item.media_details?.width, height: item.media_details?.height };
  }
  async getPreview(): Promise<ProductImage | undefined> {
    const card = (await this.cards())[0];
    return card ? this.productImage(await this.image(card.mediaId)) : undefined;
  }
  async listEntries(): Promise<CollectionDirectoryEntry[]> {
    const cards = await this.cards();
    const ids = [...new Set(cards.map((c) => c.mediaId))];
    const media: WordPressMedia[] = [];
    // Individual attachment routes work on the legacy installation; cap concurrency.
    for (let offset = 0; offset < ids.length; offset += 6) {
      media.push(...await Promise.all(ids.slice(offset, offset + 6).map((id) => this.image(id))));
    }
    const categories = await getCategoryService().listCategories();
    const collectionCards = cards.filter(
      (card) => !categories.some((category) => category.slug === card.slug),
    );
    const counts = new Map<string, number | null>();
    for (let offset = 0; offset < collectionCards.length; offset += COUNT_CONCURRENCY) {
      const batch = collectionCards.slice(offset, offset + COUNT_CONCURRENCY);
      const results = await Promise.all(batch.map(async (card) => {
        try {
          const entry = await this.getEntry(card.slug);
          const candidates = collectionSearchQueries(card.slug, card.title, entry?.query);
          for (const query of candidates) {
            const result = await getSearchService().searchProducts({ query, page: 1, pageSize: 1 });
            if (result.pagination.totalItems > 0) {
              return [card.slug, result.pagination.totalItems] as const;
            }
          }
          return [card.slug, 0] as const;
        } catch {
          // A missing collection query should not prevent the directory rendering.
          return [card.slug, null] as const;
        }
      }));
      for (const [slug, count] of results) counts.set(slug, count);
    }

    return cards.flatMap((card) => {
      const item = media.find((m) => m.id === card.mediaId);
      const category = categories.find((c) => c.slug === card.slug);
      const total = category?.productCount ?? counts.get(card.slug);
      if (total !== undefined && total !== null && total < MIN_COLLECTION_PRODUCT_COUNT) return [];
      return [{ slug: card.slug, title: card.title,
        countLabel: total === undefined || total === null
          ? undefined
          : `${total.toLocaleString("en-IN")} Items`,
        href: category ? routes.category(category.slug) : routes.collection(card.slug), image: item ? this.productImage(item) : undefined }];
    });
  }
  async getEntry(slug: string): Promise<CollectionDirectoryEntry | null> {
    const entry = (await this.cards()).find((c) => c.slug === slug);
    if (!entry) return null;
    const pages = await apiFetch<WordPressPage[]>(apiEndpoints.wordpress.pages, {
      ...cache, wordpress: true, searchParams: { slug, per_page: 1, _fields: "slug,content" },
    });
    const pageQuery = collectionGridQuery(pages[0]?.content.rendered ?? "");
    const query = collectionSearchQueries(slug, entry.title, pageQuery)[0] ?? entry.title;
    return { ...entry, query };
  }
  async listProducts(slug: string, page: number) {
    const entry = await this.getEntry(slug);
    if (!entry?.query) return { products: [], total: 0, totalPages: 0 };
    const result = await getSearchService().searchProducts({
      query: entry.query,
      page,
      pageSize: 24,
    });
    return {
      products: result.items,
      total: result.pagination.totalItems,
      totalPages: result.pagination.totalPages,
    };
  }
}
let cached: CollectionDirectoryService | null = null;
export function getCollectionDirectoryService(): CollectionDirectoryService {
  return cached ??= process.env.USE_MOCK_API !== "true" && process.env.CH_API_URL
    ? new WordPressCollectionDirectoryService() : new MockCollectionDirectoryService();
}
