import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Breadcrumbs, Container } from "@/components/layout";
import { JsonLd } from "@/components/seo";
import { DirectoryCollection, ProductGrid, SortSelect } from "@/components/product";
import {
  ActiveFilters,
  FilterDrawer,
  FilterPanel,
  NoResults,
} from "@/components/search";
import listingStyles from "@/components/search/ListingPage.module.css";
import { PAGINATION, SITE } from "@/lib/constants";
import { popularSearches } from "@/lib/navigation";
import {
  buildListingHref,
  countActiveFilters,
  LISTING_SORT_OPTIONS,
  parseListingParams,
  toSearchParams,
} from "@/lib/search-params";
import { routes } from "@/lib/routes";
import { breadcrumbJsonLd } from "@/lib/seo";
import { getCollectionDirectoryService, getCollectionService, getSearchService } from "@/lib/services";

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Matches REVALIDATE_SECONDS.catalog in lib/cache.ts (segment
// configs must be literals — keep the two in sync).
export const revalidate = 3600;

// No generateStaticParams: these listings read `searchParams` (filters,
// sort, pagination), so they render on demand. Origin stays cheap via
// the cached service fetch; the CDN caches HTML by full URL.

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionService().getCollectionBySlug(slug);
  if (!collection) {
    const entry = await getCollectionDirectoryService().getEntry(slug);
    return entry ? { title: entry.title, alternates: { canonical: `${SITE.url}${routes.collection(slug)}` } } : { title: "Collection not found" };
  }
  const url = `${SITE.url}/collections/${slug}`;
  const description = `${collection.title} — ${collection.tagline} Curated Indian creative assets on ${SITE.name}.`;
  return {
    title: `${collection.title} Collection`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${collection.title} Collection · ${SITE.name}`,
      description,
      url,
      siteName: SITE.name,
      type: "website",
    },
  };
}

/**
 * Topical collection listing (Diwali, Logo Templates, Bollywood, …).
 * Collections are discovery content, separate from the product taxonomy:
 * the slug constrains results via the collection query while every other
 * filter keeps working. Scales to thousands of collections — one route.
 */
export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollectionService().getCollectionBySlug(slug);
  // No loading.tsx in this segment on purpose: a Suspense fallback would
  // absorb this notFound() and serve HTTP 200 with the skeleton forever
  // (vercel/next.js#98954).
  if (!collection) {
    const listing = parseListingParams((await searchParams) ?? {});
    return <DirectoryCollection slug={slug} page={listing.page} />;
  }

  const basePath = `/collections/${slug}`;
  const listing = parseListingParams((await searchParams) ?? {});
  const input = toSearchParams(listing, PAGINATION.defaultPageSize);
  input.filters = { ...input.filters, collection: slug };

  const [result, collections] = await Promise.all([
    getSearchService().searchProducts(input),
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
      <div className={listingStyles.page}>
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: collection.title }]}
        />

        <header
          className={listingStyles.hero}
          style={{ "--hero-hue": collection.hue } as CSSProperties}
        >
          <p className={listingStyles.heroKicker}>Collection</p>
          <h1 className={listingStyles.heroTitle}>{collection.title}</h1>
          <p className={listingStyles.heroTagline}>{collection.tagline}</p>
        </header>
        <p className={listingStyles.sub} role="status">
          {pagination.totalItems}{" "}
          {pagination.totalItems === 1 ? "product" : "products"} in this
          collection
        </p>

        <div className={listingStyles.toolbar}>
          <FilterDrawer
            params={listing}
            categoryFacet={categoryFacet}
            fileTypeFacet={fileTypeFacet}
            collections={collections}
            activeCount={activeCount}
            basePath={basePath}
            hideCollection
            className={listingStyles.drawerTrigger}
          />
          <SortSelect
            id="collection-sort"
            value={listing.sort}
            options={LISTING_SORT_OPTIONS}
          />
        </div>

        <ActiveFilters
          params={listing}
          collections={collections}
          basePath={basePath}
        />

        <div className={listingStyles.layout}>
          <aside className={listingStyles.sidebar} aria-label="Filters">
            <FilterPanel
              params={listing}
              categoryFacet={categoryFacet}
              fileTypeFacet={fileTypeFacet}
              collections={collections}
              basePath={basePath}
              idPrefix="collection-filter"
              hideCollection
            />
          </aside>
          <div className={listingStyles.results}>
            {items.length === 0 ? (
              <NoResults
                query=""
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
                    buildListingHref(basePath, { ...listing, page }),
                }}
              />
            )}
          </div>
        </div>
      </div>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: routes.home() },
          { name: collection.title },
        ])}
      />
    </Container>
  );
}
