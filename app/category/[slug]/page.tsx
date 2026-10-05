import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, Container } from "@/components/layout";
import { JsonLd } from "@/components/seo";
import { ProductGrid, SortSelect } from "@/components/product";
import {
  ActiveFilters,
  FilterDrawer,
  FilterPanel,
  NoResults,
} from "@/components/search";
import listingStyles from "@/components/search/ListingPage.module.css";
import { PAGINATION, SITE } from "@/lib/constants";
import { routes } from "@/lib/routes";
import { popularSearches } from "@/lib/navigation";
import {
  breadcrumbJsonLd,
  categoryCanonical,
  categoryMetaDescription,
  categoryMetaTitle,
} from "@/lib/seo";
import {
  buildListingHref,
  countActiveFilters,
  LISTING_SORT_OPTIONS,
  parseListingParams,
  toSearchParams,
} from "@/lib/search-params";
import {
  getCategoryService,
  getCollectionService,
  getSearchService,
} from "@/lib/services";
import {
  getGroup,
  isGroupSlug,
  parentGroupSlug,
} from "@/lib/taxonomy";
import type { ProductGroupSlug } from "@/lib/types";

interface CategoryPageProps {
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
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const category = await getCategoryService().getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  const url = categoryCanonical(category);
  const description = categoryMetaDescription(category);
  const title = categoryMetaTitle(category);
  const hasListingState = Object.entries(query).some(([key, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    return key === "page"
      ? Number(entries[0]) > 1
      : entries.some((entry) => Boolean(entry));
  });
  return {
    title,
    description,
    alternates: { canonical: url },
    ...(hasListingState ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${title} · ${SITE.name}`,
      description,
      url,
      siteName: SITE.name,
      type: "website",
    },
  };
}

/**
 * Taxonomy listing: groups (Vector Creatives, Character Bundle, Freebies)
 * and subcategories (Flyers, Mythological, …). The page slug acts as a base
 * constraint merged with URL filters; data flows through `searchProducts()`.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { slug } = await params;
  const category = await getCategoryService().getCategoryBySlug(slug);
  // No loading.tsx in this segment on purpose: a Suspense fallback would
  // absorb this notFound() and serve HTTP 200 with the skeleton forever
  // (vercel/next.js#98954).
  if (!category) notFound();

  const basePath = slug === "illustrations" ? routes.illustrations() : routes.category(slug);
  const listing = parseListingParams((await searchParams) ?? {});
  const input = toSearchParams(listing, PAGINATION.defaultPageSize);
  // Base constraint OR-merges with same-kind URL filters (selecting another
  // subcategory broadens the listing; chips make the state explicit).
  if (isGroupSlug(slug)) {
    input.filters = {
      ...input.filters,
      groups: Array.from(
        new Set([...(input.filters?.groups ?? []), slug as ProductGroupSlug]),
      ),
    };
  } else {
    input.filters = {
      ...input.filters,
      categorySlugs: Array.from(
        new Set([...(input.filters?.categorySlugs ?? []), slug]),
      ),
    };
  }

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
  const parentSlug = parentGroupSlug(category.slug);
  const parent = parentSlug ? getGroup(parentSlug) : null;

  return (
    <Container>
      <div className={listingStyles.page}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            ...(parent
              ? [{ label: parent.name, href: `/category/${parent.slug}` }]
              : []),
            { label: category.name },
          ]}
        />

        <header className={listingStyles.header}>
          {parent && <p className={listingStyles.eyebrow}>{parent.name}</p>}
          <h1 className={listingStyles.title}>{category.name}</h1>
          {category.description && (
            <p className={listingStyles.description}>{category.description}</p>
          )}
          <p className={listingStyles.sub} role="status">
            {pagination.totalItems}{" "}
            {pagination.totalItems === 1 ? "product" : "products"}
          </p>
        </header>

        <div className={listingStyles.toolbar}>
          <FilterDrawer
            params={listing}
            categoryFacet={categoryFacet}
            fileTypeFacet={fileTypeFacet}
            collections={collections}
            activeCount={activeCount}
            basePath={basePath}
            hideGroups
            className={listingStyles.drawerTrigger}
          />
          <SortSelect
            id="category-sort"
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
              idPrefix="category-filter"
              hideGroups
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
          ...(parent
            ? [{ name: parent.name, path: routes.category(parent.slug) }]
            : []),
          { name: category.name, path: routes.category(category.slug) },
        ])}
      />
    </Container>
  );
}
