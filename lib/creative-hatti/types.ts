export interface ChApiEnvelope<TData> {
  success: boolean;
  data: TData;
  pagination?: ChApiPagination;
}

export interface ChApiPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ChApiSearchResult extends ChApiEnvelope<ChApiProductCard[]> {
  facets: import("@/lib/types").SearchFacet[];
  took_ms: number;
}

export interface ChApiMoney {
  type?: "single" | "variable";
  amount: number;
  formatted?: string;
  currency: string;
}

export interface ChApiTerm {
  id: number;
  name: string;
  slug: string;
}

export interface ChApiImage {
  id: number;
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface ChApiProductCard {
  id: number;
  title: string;
  slug: string;
  price: ChApiMoney;
  image?: ChApiImage | null;
  categories?: ChApiTerm[];
  featured?: boolean;
  file_type?: string | null;
  file_size?: string | null;
}

export interface ChApiVariablePrice {
  id?: number | string;
  name?: string;
  amount?: number;
  formatted?: string;
  currency?: string;
}

export interface ChApiProductDetail extends ChApiProductCard {
  status?: string;
  date?: string;
  modified?: string;
  description?: string | null;
  short_description?: string | null;
  variable_prices?: ChApiVariablePrice[];
  featured_image?: ChApiImage | null;
  gallery?: ChApiImage[];
  tags?: ChApiTerm[];
  compatible_with?: string | null;
  documentation?: boolean | string | null;
}

export interface ChApiCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  count?: number;
  parent?: number;
  image_url?: string;
  image?: ChApiImage | null;
}

export interface ChApiHomepageCharacter {
  id: string;
  name: string;
  blurb: string;
  query: string;
  category_slug: string;
  hue: number;
  artwork: string;
  count: number;
  image?: ChApiImage | null;
}

export interface ChApiHomepagePack {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  query: string;
  hue: number;
  kind: "festival" | "seasonal" | "topical";
  featured: true;
  sort_order: number;
  category_slug: string;
  image?: ChApiImage | null;
  artwork: string;
}

export interface ChApiHomepageSections {
  discovery_tiles?: ChApiHomepageTile[];
  seasonal_collections?: ChApiHomepageTile[];
  keywords?: string[];
  trusted_brands?: Array<{ id: number; name: string; image: ChApiImage }>;
  character_categories_enabled: boolean;
  featured_packs_enabled: boolean;
  character_categories: ChApiHomepageCharacter[];
  featured_packs: ChApiHomepagePack[];
}

export interface ChApiHomepageTile {
  id: string;
  title: string;
  caption?: string;
  query: string;
  category_slug?: string;
  hue?: number;
  icon?: string;
  image?: ChApiImage | null;
}
