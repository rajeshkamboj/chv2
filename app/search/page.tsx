import type { Metadata } from "next";
import { Breadcrumbs, Container } from "@/components/layout";
import { ProductGrid, SortSelect } from "@/components/product";
import {
  ActiveFilters,
  FilterDrawer,
  FilterPanel,
  NoResults,
} from "@/components/search";
import { PAGINATION } from "@/lib/constants";
import { popularSearches } from "@/lib/navigation";
import {
  buildListingHref,
  countActiveFilters,
  LISTING_SORT_OPTIONS,
  parseListingParams,
  toSearchParams,
} from "@/lib/search-params";
import { getCollectionService, getSearchService } from "@/lib/services";
import styles from "./page.module.css";

interface SearchPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = parseListingParams((await searchParams) ?? {});
  return {
    title: params.q ? `Results for “${params.q}”` : "Search all assets",
    // High-cardinality query URLs stay out of the index (crawl budget);
    // discovery happens through categories, collections and products.
    robots: { index: false, follow: true },
  };
}

/**
 * Product discovery: keyword search + taxonomy filters + sort + pagination.
 * Fully URL-driven and server-rendered — only the current page of results
 * ever reaches the browser. Data flows exclusively through `searchProducts()`.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const listing = parseListingParams((await searchParams) ?? {});
  const [result, collections] = await Promise.all([
    getSearchService().searchProducts(
      toSearchParams(listing, PAGINATION.defaultPageSize),
    ),
    getCollectionService().listCollections(),
  ]);

  const categoryFacet =
    result.facets.find((facet) => facet.key === "category")?.values ?? [];
  const fileTypeFacet =
    result.facets.find((facet) => facet.key === "fileType")?.values ?? [];
  const activeCount = countActiveFilters(listing);
  const { items, pagination } = result;

  return (
    <Container>
      <div className={styles.page}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: listing.q ? `Search: ${listing.q}` : "Search" },
          ]}
        />

        <header className={styles.header}>
          <h1 className={styles.title}>
            {listing.q ? (
              <>
                Results for <q className={styles.query}>{listing.q}</q>
              </>
            ) : (
              "Browse all assets"
            )}
          </h1>
          <p className={styles.sub} role="status">
            {pagination.totalItems}{" "}
            {pagination.totalItems === 1 ? "result" : "results"}
            {result.tookMs !== undefined && (
              <span className={styles.took}> · {result.tookMs} ms</span>
            )}
          </p>
        </header>

        <div className={styles.toolbar}>
          <FilterDrawer
            params={listing}
            categoryFacet={categoryFacet}
            fileTypeFacet={fileTypeFacet}
            collections={collections}
            activeCount={activeCount}
            className={styles.drawerTrigger}
          />
          <SortSelect
            id="search-sort"
            value={listing.sort}
            options={LISTING_SORT_OPTIONS}
          />
        </div>

        <ActiveFilters
          params={listing}
          collections={collections}
        />

        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label="Filters">
            <FilterPanel
              params={listing}
              categoryFacet={categoryFacet}
              fileTypeFacet={fileTypeFacet}
              collections={collections}
              idPrefix="search-filter"
            />
          </aside>
          <div className={styles.results}>
            {items.length === 0 ? (
              <NoResults
                query={listing.q}
                popularSearches={popularSearches}
                collections={collections}
              />
            ) : (
              <ProductGrid cardTitleAs="h2"
                masonry
                products={items}
                pagination={{
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                  buildHref: (page) =>
                    buildListingHref("/search", { ...listing, page }),
                }}
              />
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
