# Creative Hatti API SEO patch (Tasks 19–24)

The active API plugin is installed under Laragon outside this Next.js
workspace. Apply this patch to
`wp-content/plugins/creative-hatti-api/` and deploy it to the production API
before switching Next.js to live catalogue mode.

## 1. Product Yoast fields

In `includes/class-ch-product-transformer.php`, add this helper to
`CH_Product_Transformer`:

```php
private function seo( $post_id ) {
	$title = trim( (string) get_post_meta( $post_id, '_yoast_wpseo_title', true ) );
	$description = trim( (string) get_post_meta( $post_id, '_yoast_wpseo_metadesc', true ) );
	$canonical = trim( (string) get_post_meta( $post_id, '_yoast_wpseo_canonical', true ) );

	// Resolve Yoast replacement variables the same way Yoast does when rendering.
	if ( function_exists( 'wpseo_replace_vars' ) ) {
		$title = wpseo_replace_vars( $title, get_post( $post_id ) );
		$description = wpseo_replace_vars( $description, get_post( $post_id ) );
	}

	$seo = array();
	if ( '' !== trim( $title ) ) {
		$seo['title'] = sanitize_text_field( $title );
	}
	if ( '' !== trim( $description ) ) {
		$seo['description'] = sanitize_text_field( $description );
	}
	if ( '' !== $canonical ) {
		$seo['canonical_url'] = esc_url_raw( $canonical );
	}

	return $seo;
}
```

Add `'seo' => $this->seo( $post->ID ),` to the array returned by `single()`.
`title`, `description`, and `canonical_url` are the only Yoast fields the
current Next.js metadata adapter consumes. Scores, focus keywords, synonyms,
primary category, and timestamps are not required and should remain omitted.

## 2. Category Yoast fields

In `includes/class-ch-categories-controller.php`, add `seo` to `term_dto()`:

```php
$title = trim( (string) get_term_meta( $term->term_id, 'wpseo_title', true ) );
$description = trim( (string) get_term_meta( $term->term_id, 'wpseo_desc', true ) );
$canonical = trim( (string) get_term_meta( $term->term_id, 'wpseo_canonical', true ) );
$seo = array();
if ( '' !== $title ) { $seo['title'] = sanitize_text_field( $title ); }
if ( '' !== $description ) { $seo['description'] = sanitize_text_field( $description ); }
if ( '' !== $canonical ) { $seo['canonical_url'] = esc_url_raw( $canonical ); }
```

Then include `'seo' => $seo,` in the returned term DTO. Confirm the taxonomy
meta keys on staging before release; Yoast taxonomy fields are commonly stored
without the post-meta underscore prefix. Omit empty values.

## 3. Bounded sitemap endpoint

In `CH_Products_Controller::register_routes()`, register this route before the
`/products/(?P<id>...)` route:

```php
register_rest_route(
	CH_API::NAMESPACE,
	'/products/sitemap',
	array(
		'methods' => WP_REST_Server::READABLE,
		'callback' => array( $this, 'get_sitemap_products' ),
		'permission_callback' => array( 'CH_API', 'public_read_permission' ),
		'args' => array(
			'page' => array( 'default' => 1, 'sanitize_callback' => 'absint' ),
			'per_page' => array( 'default' => 48, 'sanitize_callback' => 'absint' ),
		),
	)
);
```

Add this method to `CH_Products_Controller`:

```php
public function get_sitemap_products( WP_REST_Request $request ) {
	$page = max( 1, absint( $request['page'] ) );
	$per_page = absint( $request['per_page'] );
	if ( $per_page < 1 || $per_page > 48 ) {
		return CH_API::error( 'invalid_per_page', 'per_page must be between 1 and 48.', 400 );
	}

	global $wpdb;
	$offset = ( $page - 1 ) * $per_page;
	// Use one indexed metadata lookup for optional canonical values; fetch
	// only public post columns and canonical metadata. No EDD objects and no
	// per-row get_post_meta() calls.
	$total = (int) $wpdb->get_var(
		$wpdb->prepare(
			"SELECT COUNT(ID) FROM {$wpdb->posts} WHERE post_type = %s AND post_status = %s",
			self::POST_TYPE,
			'publish'
		)
	);
	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT p.post_name AS slug, p.post_modified_gmt AS modified, pm.meta_value AS canonical_url
			 FROM {$wpdb->posts} p
			 LEFT JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = %s
			 WHERE p.post_type = %s AND p.post_status = %s
			 ORDER BY p.ID ASC LIMIT %d OFFSET %d",
			'_yoast_wpseo_canonical',
			self::POST_TYPE,
			'publish',
			$per_page,
			$offset
		),
		ARRAY_A
	);

	$items = array_map(
		static function ( $row ) {
			$item = array(
				'slug' => $row['slug'],
				'modified' => mysql_to_rfc3339( $row['modified'] ),
			);
			if ( ! empty( $row['canonical_url'] ) ) {
				$item['canonical_url'] = esc_url_raw( $row['canonical_url'] );
			}
			return $item;
		},
		$rows
	);

	return CH_API::success(
		array(
			'total' => $total,
			'items' => $items,
		)
	);
}
```

This performs one `COUNT` and one bounded join query per request. It returns
only the full published-post count, slug, modified date, and optional Yoast
canonical. `ORDER BY p.ID` makes page boundaries stable while the catalogue is
unchanged. Keep `per_page <= 48`; do not call `edd_get_download()` or the
general transformer. If catalogue writes are frequent during a sitemap crawl,
use an indexed keyset cursor (`after_id`) instead of offset pagination and
update the Next.js client contract at the same time.

Response contract (the same success envelope used by the other Creative Hatti
API endpoints):

```json
{"success":true,"data":{"total":44792,"items":[{"slug":"...","modified":"2026-01-01T00:00:00+00:00"}]}}
```

The Next.js service requests `/products/sitemap` and reads the standard
`CH_API::success()` envelope as `result.data`. Do not add an unwrapped response
or a second endpoint alias.

## 4. Structured data and index policy

Next.js already emits Product + BreadcrumbList JSON-LD on product pages,
BreadcrumbList on categories/collections, and Organization + WebSite on the
homepage. Yoast’s fields are consumed as metadata only; they do not contain
rendered Yoast JSON-LD, so keep the existing single Next.js schema instances.
Do not add a second Yoast schema graph to the frontend.

Before release, confirm any non-empty Yoast canonical points to the intended
Next.js URL (`https://www.creativehatti.com/product/{slug}` or
`/category/{slug}`). Correct/remove old WordPress canonicals in the source;
do not blindly publish old-host or irrelevant canonical URLs.

The production WordPress site must not independently index duplicate public
product/category pages after the Next.js storefront becomes canonical. During
migration, 301 old product and category URLs to their new storefront routes.
For a backend retained for editors/API only, set its public HTML product and
taxonomy archives to `noindex,follow` (or remove those routes); do not block
those pages in robots.txt because crawlers must see the noindex/redirect.
Keep API endpoints crawl-neutral, and publish the storefront’s sitemap index
only from the Next.js host. Keep filters/sorts canonical to the clean base
category and mark high-cardinality filtered/search pages `noindex,follow`.
