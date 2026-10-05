# Creative Hatti API Integration

## Configuration

The frontend reads the WordPress catalogue API from the server-only environment variable:

```env
CH_API_URL=http://creativehatti.test/wp-json/ch/v1
```

No browser-exposed API URL is required for the public catalogue phase. `USE_MOCK_API=true` can still force the local mock services.

## Service Architecture

UI code continues to read catalogue data only through `@/lib/services`.

- `lib/api/client.ts` owns base URL resolution, fetch options, error handling, and Next.js cache settings.
- `lib/api/endpoints.ts` contains the Creative Hatti route paths.
- `lib/creative-hatti/types.ts` describes the WordPress API response shapes.
- `lib/creative-hatti/adapters.ts` normalizes API envelopes into existing frontend `Product` and `Category` models.
- `lib/services/productService.ts`, `categoryService.ts`, and `searchService.ts` choose the API implementation when `CH_API_URL` is configured.

## Integrated Routes

- `/` uses real featured products and real category counts.
- `/search` uses `GET /products` as the paginated browse/archive surface.
- `/category/[slug]` uses backend category filtering through `GET /products?category=...`.
- `/product/[slug]` uses `GET /products/slug/{slug}` for product detail, gallery, metadata, SEO, and Open Graph.
- Yoast fields are exposed by the local Laragon API plugin on product detail
  responses as `seo.title`, `seo.description`, and `seo.canonical_url`, and on
  categories as the same fields when populated. Empty category SEO values
  serialize as `{}`. The local database currently has no product canonical
  values and no category Yoast term values, so storefront canonicals use the
  Next.js route and category SEO returns an empty object until metadata is
  populated.
- Product sitemap contract: implement `GET /wp-json/ch/v1/products/sitemap?page=N&per_page=48`
  as an active-product-only, stable paginated feed returning
  the standard API success envelope:
  `{ "success": true, "data": { "total": 44800, "items": [{ "slug": "...", "modified": "...", "canonical_url": null }] } }`.
  The total must not be capped with the ordinary catalogue page limit. The
  frontend requests a one-row batch for the total and then one bounded batch
  per sitemap file. Sitemap chunk IDs are generated from that total and
  robots.txt advertises Next.js's generated sitemap index at `/sitemap.xml`;
  `/sitemap/0.xml` is the static/taxonomy chunk, not the index.
- The Next.js service requests `/products/sitemap` and explicitly reads the
  `{ success, data: { total, items } }` envelope; keep the plugin and frontend
  on this single route and response shape.
- The plugin implementation is applied to the separate local Laragon
  `creative-hatti-api` plugin and passes local API smoke tests. It is not
  checked into this workspace; deploy the plugin changes to production before
  production can return the new SEO fields or full sitemap feed.
- Product sitemap files are numbered chunks of 48 public products. The
  generated `/sitemap.xml` index links to the static/taxonomy chunk and all
  product chunks.
- The homepage's character and featured-pack cards can be curated in WordPress
  through the separate `Creative Hatti Homepage Sections` plugin. Its
  `GET /homepage-sections` endpoint is read by `HomepageService`; disabled
  sections continue to use the storefront's built-in content.

## Homepage card curation

Install `wordpress/creative-hatti-home-sections/` into the WordPress plugins
directory and activate it. In **Settings → Homepage Sections**, select EDD
`download_category` terms, set optional card copy and accent hues, choose a
fallback illustration, and pick thumbnail images from the Media Library.
The plugin exposes only this public editorial content at
`/wp-json/ch/v1/homepage-sections`; edits remain behind WordPress's
`manage_options` capability.
The storefront refreshes these choices at least once per minute.

## Field Mapping

Products map title, slug, price, featured image, gallery, categories, tags, featured state, file type, file size, compatible-with, documentation flag, created date, and modified date.

Prices from the API are rupee values and are converted to the app's minor-unit `Money` shape for existing `formatMoney()` usage.

Category slugs are normalized where the old frontend taxonomy differs from WordPress:

- `character-bundles` -> `character-bundle`
- `miscellaneous-character-bundles` -> `miscellaneous`

## Images

`next.config.ts` allows images from:

- `http://creativehatti.test`
- `https://creativehatti.test`
- `https://cdn.creativehatti.com`

The app still uses `next/image`; no global `unoptimized` escape hatch was added.

## Caching

Current revalidation windows remain:

- catalogue/category lists: 3600 seconds
- product detail: 1800 seconds
- search/browse responses: 60 seconds
- static/home content: 86400 seconds

This is simple ISR-ready caching until explicit webhook invalidation exists.

## Known Limitations

- Search is not implemented yet. `/search` is currently the browse/archive page and does not perform keyword search against the backend.
- File type facets are empty in API mode because the current category/product endpoints do not expose aggregate file-type counts.
- Sort support is conservative. Newest/oldest are sent as date order; best-selling, rating, title, and price sorting need confirmed backend parameters before use.
- Full product sitemap coverage needs a backend sitemap/index endpoint. The catalogue API caps `per_page` at 48, so build-time crawling all 44,792 products is intentionally avoided.
- Cart, checkout, auth, dashboard, protected downloads, wishlist backend, licenses, and Razorpay remain pending by design.

## Live API Smoke Tests

Verified against:

- `GET /products?per_page=2`
- `GET /products?per_page=2&category=freebies`
- `GET /products?per_page=2&featured=true`
- `GET /products/slug/portrait-of-tennis-players-playing-on-a-rooftop`
- `GET /categories/freebies`
