# Indexed catalogue search

This separate backend plugin serves `GET /wp-json/ch/v1/indexed-search` from
the existing WordPress/EDD catalogue. Next.js calls it only through
`getSearchService()`; no catalogue or credentials are loaded into the browser.
The separate path avoids replacing an existing plugin's `/search` route.

## Install and build

1. Copy this folder to `wp-content/plugins/creative-hatti-search`.
2. Activate **Creative Hatti Indexed Search**. EDD must be active.
3. Run `wp ch-search reindex` and check `wp ch-search status`.
4. Configure Next.js with `CH_API_URL=https://your-wordpress/wp-json/ch/v1`
   and `USE_MOCK_API=false`. Restart Next.js after changing its environment.

For Laragon without WP-CLI, use its PHP binary:

```powershell
C:\laragon\bin\php\php-8.3.33-Win32-vs16-x64\php.exe wordpress/creative-hatti-search/console.php --path=C:\laragon\www\creativehatti --url=http://creativehatti.test --command=activate
C:\laragon\bin\php\php-8.3.33-Win32-vs16-x64\php.exe wordpress/creative-hatti-search/console.php --path=C:\laragon\www\creativehatti --url=http://creativehatti.test --command=reindex
C:\laragon\bin\php\php-8.3.33-Win32-vs16-x64\php.exe wordpress/creative-hatti-search/console.php --path=C:\laragon\www\creativehatti --url=http://creativehatti.test --command=status
```

## SEO and sitemap data contract

The product API should expose migrated Yoast overrides on detail records as
`seo: { title, description, canonical_url }`, reading
`_yoast_wpseo_title` and `_yoast_wpseo_metadesc`. Empty values should be
omitted. Product list records may carry the optional canonical URL for the
sitemap. The sitemap feed is `GET /wp-json/ch/v1/products/sitemap?page=N&per_page=48`
and returns `{ total, items: [{ slug, modified, canonical_url }] }`; it must
use stable ordering and the full published-product total, not the normal
catalogue page cap.

Index creation adds three prefixed InnoDB tables; it does not alter WordPress
source tables. Build batches use ID keysets, 100 products and one transaction
per batch. An interrupted initial build resumes from its last committed batch.
`wp ch-search reindex --restart` restarts from zero. Subsequent full builds
refresh the active index in batches; they do not provide an atomic whole-index
swap. A MySQL advisory lock prevents concurrent CLI builds.
Search returns HTTP 503 until the first full build succeeds. Failed queries
also return 503; the storefront shows a retry state instead of mock results.

## Query contract

Example: `/indexed-search?q=diwali&sort=price-asc&file=EPS,PNG&page=2&per_page=24`

| Parameter | Meaning |
| --- | --- |
| `q` | Case/accent-normalized AND token prefix search; max 160 bytes, 8 distinct tokens |
| `page`, `per_page` | Page number (1–50,000), page size (1–96, default 24) |
| `sort` | relevance, newest, oldest, price-asc, price-desc, title-asc, title-desc, rating, best-selling |
| `cat`, `group` | API taxonomy slugs, comma-separated; category ancestors included |
| `file`, `app` | File types and compatible application names/tokens |
| `min`, `max` | Integer **paise**, inclusive; product DTO prices remain **rupees** |
| `avail` | free or paid, derived from the lowest purchasable price |
| `collection` | Editorial collection slug mapped to its search terms |
| `rating`, `license`, `sale` | Explicit indexed attributes supplied by the integration filter |

Each multi-select accepts up to 8 values (100 bytes each). OR within each
parameter; AND across parameters and query tokens. Unknown collections and
invalid ranges/sorts return 400. Out-of-range pages clamp to the last page.
The response contains `success`, `data` (public card DTOs), `pagination`,
`facets` and `took_ms`. Facet counts cover **all matching products**, not just
the current page. Facets reflect all current filters and include ancestors.
Each sort ends with a product ID tie-breaker so unchanged results page stably.
Live publication/password checks prevent stale indexed rows returning private
products. Next.js caches successful queries for 60 seconds, so changes can
remain visible in its existing cache for that period.

## Index and updates

The inverted token index has `(word, product_id)` as its primary key. Prefix
queries use this index; matching does not scan WordPress `post_content` or join
the multi-million-row legacy tag table. Matching scores title tokens at 8,
taxonomy/tag/file/app tokens at 3 and excerpt tokens at 1. Prefix matches take
the highest field weight per token. Query tokens must have at least two
letters/numbers; punctuation is split and single characters are ignored.
It supports short format terms such as AI without MySQL FULLTEXT stopwords or
minimum-token server settings. It does **not** provide typo correction,
stemming or semantic search. Stopword queries can have broad result sets.

Each search materializes only matching IDs and relevance scores in a
connection-local MEMORY temporary table. Counts, result paging and facets reuse
that set; the table is dropped before responding. The database user needs
`CREATE TEMPORARY TABLES`, and `max_heap_table_size` must accommodate the
matching ID set (the default 16 MB is sufficient for this 44K catalogue).
Allocation/query failures return 503. A covering facet index avoids extra row
lookups during result-based facet aggregation.

Only title, public excerpt (first 1,000 bytes), categories/ancestors, file type,
compatibility and up to 24 tags selected by term ID are indexed. Tags are
bounded because the audit found extensive noisy legacy tagging. Use the
`ch_search_curated_tags` filter to select higher-quality tags before indexing;
the returned tags remain capped at 24. Download URLs, order/customer metadata,
licence keys and storage credentials are never read or serialized.

Product saves, relevant metadata changes, taxonomy assignments and deletions
refresh/remove affected documents. Writes coalesce at request shutdown and
retry through WP-Cron on failure. Term edits/deletions schedule a bounded
catalogue refresh. Ensure WP-Cron runs regularly (or use a system cron calling
`wp cron event run --due-now`). Direct SQL imports bypass hooks; run a complete
reindex after them. Changes to featured image media, EDD currency settings or
custom attribute sources also require reindexing the affected products.

`ch_search_product_attributes` can supply `rating` (0–5), `on_sale` (boolean)
and `licenses` (public licence codes). Their defaults are 0/false/empty because
the audited catalogue does not have a verified mapping for these fields.
`ch_search_collection_queries` extends the editorial slug/query mapping.

## Verification

```powershell
npm run test:search
$env:SEARCH_TEST_API_URL = 'http://creativehatti.test/wp-json/ch/v1'
npm run test:search:integration
$env:SEARCH_TEST_STOREFRONT_URL = 'http://localhost:3000'
npm run test:search:integration
# Fixture tests create and delete only their own temporary products:
C:\laragon\bin\php\php-8.3.33-Win32-vs16-x64\php.exe tests/search-index.php --path=C:\laragon\www\creativehatti --url=http://creativehatti.test
```

The HTTP suite reads the real catalogue without writing products. It checks
full-catalogue count, keywords/prefixes, paging, facets, prices, categories,
collections, short format terms and input validation. Run the PHP fixture
suite in `tests/search-index.php` to verify update/delete/publication hooks.

Before production activation, back up the database, build the index on staging
and measure p95 response times and concurrent load on the production-sized
catalogue. SQL count/facet aggregation and deep offset paging still depend on
database capacity. This plugin supplies a bounded indexed search path; local
functional tests do not prove production throughput. Keep the index tables on
deactivation for reversible rollback; drop them separately only if intended.
