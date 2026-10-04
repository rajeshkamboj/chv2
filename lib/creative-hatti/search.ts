import type { SearchFacet, SearchParams } from "@/lib/types";
import { apiCategorySlug, frontendCategorySlug } from "./adapters";

/** The indexed search API uses paise for filters and rupees in product DTOs. */
export function searchRequestParams(params: SearchParams) {
  const filters = params.filters ?? {};
  const list = (values?: string[]) => values?.length ? values.join(",") : undefined;
  return {
    q: params.query.trim(),
    page: params.page,
    per_page: params.pageSize,
    sort: params.sort ?? "relevance",
    group: list(filters.groups?.map(apiCategorySlug)),
    cat: list(filters.categorySlugs?.map(apiCategorySlug)),
    min: filters.priceMin,
    max: filters.priceMax,
    avail: filters.availability,
    rating: filters.ratingMin,
    file: list(filters.fileTypes),
    app: list(filters.compatibleWith),
    collection: filters.collection,
    license: list(filters.licenses),
    sale: filters.onSale ? true : undefined,
  };
}

export function searchFacetsFromApi(facets: SearchFacet[]): SearchFacet[] {
  return facets.map((facet) => ({
    ...facet,
    values: facet.values.map((value) => ({
      ...value,
      value: facet.key === "category" ? frontendCategorySlug(value.value) : value.value,
    })),
  }));
}
