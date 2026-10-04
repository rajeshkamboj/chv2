<?php
/**
 * Plugin Name: Creative Hatti Indexed Search
 * Description: Paginated public EDD catalogue search with a dedicated inverted index.
 * Version: 1.0.0
 * Requires PHP: 7.4
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class CH_Indexed_Search {

	private static $pending = array();
	private static $batch_transaction = false;

	private static function transaction( $statement ) {
		global $wpdb;
		if ( ! self::$batch_transaction ) { $wpdb->query( $statement ); }
	}

	public static function table( $suffix ) {
		global $wpdb;
		return $wpdb->prefix . 'ch_search_' . $suffix;
	}

	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $wpdb->get_charset_collate();
		$documents = self::table( 'documents' );
		$tokens = self::table( 'tokens' );
		$facets = self::table( 'facets' );
		dbDelta( "CREATE TABLE $documents (
			product_id bigint(20) unsigned NOT NULL,
			title varchar(255) NOT NULL,
			price bigint(20) unsigned NOT NULL,
			published datetime NOT NULL,
			sales bigint(20) unsigned NOT NULL DEFAULT 0,
			rating decimal(3,2) NOT NULL DEFAULT 0,
			on_sale tinyint NOT NULL DEFAULT 0,
			card longtext NOT NULL,
			PRIMARY KEY  (product_id),
			KEY price (price,product_id),
			KEY published (published,product_id),
			KEY sales (sales,product_id),
			KEY title (title,product_id)
		) ENGINE=InnoDB $charset;" );
		dbDelta( "CREATE TABLE $tokens (
			word varchar(64) NOT NULL,
			product_id bigint(20) unsigned NOT NULL,
			weight tinyint unsigned NOT NULL,
			PRIMARY KEY  (word,product_id),
			KEY product (product_id)
		) ENGINE=InnoDB $charset;" );
		dbDelta( "CREATE TABLE $facets (
			kind varchar(16) NOT NULL,
			value varchar(100) NOT NULL,
			product_id bigint(20) unsigned NOT NULL,
			label varchar(200) NOT NULL,
			PRIMARY KEY  (kind,value,product_id),
			KEY product (product_id,kind),
			KEY product_facets (product_id,kind,value,label)
		) ENGINE=InnoDB $charset;" );
	}

	/** No stopword/minimum-word-length dependency; prefix lookups use the word index. */
	public static function tokens( $text ) {
		$text = remove_accents( html_entity_decode( wp_strip_all_tags( $text ), ENT_QUOTES, 'UTF-8' ) );
		$text = function_exists( 'mb_strtolower' ) ? mb_strtolower( $text, 'UTF-8' ) : strtolower( $text );
		preg_match_all( '/[\p{L}\p{N}]{2,64}/u', $text, $matches );
		return array_values( array_unique( $matches[0] ) );
	}

	public static function boot() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_action( 'save_post_download', array( __CLASS__, 'queue' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'remove' ) );
		foreach ( array( 'added_post_meta', 'updated_post_meta', 'deleted_post_meta' ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'meta_changed' ), 10, 4 );
		}
		add_action( 'set_object_terms', array( __CLASS__, 'terms_changed' ), 10, 4 );
		add_action( 'edited_term', array( __CLASS__, 'term_changed' ), 10, 3 );
		add_action( 'delete_term', array( __CLASS__, 'term_changed' ), 10, 3 );
		add_action( 'shutdown', array( __CLASS__, 'flush' ) );
		add_action( 'ch_search_refresh', array( __CLASS__, 'refresh_batch' ) );
		add_action( 'ch_search_retry', array( __CLASS__, 'queue' ) );
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			WP_CLI::add_command( 'ch-search reindex', array( __CLASS__, 'reindex' ) );
			WP_CLI::add_command( 'ch-search status', array( __CLASS__, 'status' ) );
		}
	}

	public static function queue( $id ) {
		if ( 'download' === get_post_type( $id ) && ! wp_is_post_revision( $id ) ) {
			self::$pending[ (int) $id ] = true;
		}
	}

	public static function meta_changed( $meta_id, $id, $key, $value ) {
		$keys = array( 'edd_price', 'edd_variable_prices', '_variable_pricing', '_edd_default_price_id', '_thumbnail_id', 'file_type', 'file_size', 'compatible_with', 'edd_feature_download', '_edd_download_sales' );
		if ( in_array( $key, $keys, true ) ) { self::queue( $id ); }
	}

	public static function terms_changed( $id, $terms, $tt_ids, $taxonomy ) {
		if ( in_array( $taxonomy, array( 'download_category', 'download_tag' ), true ) ) { self::queue( $id ); }
	}

	public static function term_changed( $id, $tt_id, $taxonomy ) {
		if ( in_array( $taxonomy, array( 'download_category', 'download_tag' ), true ) && ! wp_next_scheduled( 'ch_search_refresh' ) ) {
			update_option( 'ch_search_refresh_cursor', 0, false );
			wp_schedule_single_event( time() + 1, 'ch_search_refresh' );
		}
	}

	public static function flush() {
		foreach ( array_keys( self::$pending ) as $id ) {
			$result = self::index_product( $id );
			if ( is_wp_error( $result ) && ! wp_next_scheduled( 'ch_search_retry', array( $id ) ) ) {
				wp_schedule_single_event( time() + 60, 'ch_search_retry', array( $id ) );
			}
		}
		self::$pending = array();
	}

	public static function remove( $id ) {
		global $wpdb;
		foreach ( array( 'documents', 'tokens', 'facets' ) as $suffix ) {
			if ( false === $wpdb->delete( self::table( $suffix ), array( 'product_id' => $id ), array( '%d' ) ) ) {
				return new WP_Error( 'search_index_write_failed', 'Could not remove search document.' );
			}
		}
		return true;
	}

	/** Index only a public card and bounded searchable metadata; never EDD file URLs. */
	public static function index_product( $id ) {
		global $wpdb;
		$post = get_post( $id );
		self::transaction( 'START TRANSACTION' );
		$result = self::remove( $id );
		if ( is_wp_error( $result ) ) { self::transaction( 'ROLLBACK' ); return $result; }
		if ( ! $post || 'download' !== $post->post_type || 'publish' !== $post->post_status || $post->post_password ) {
			self::transaction( 'COMMIT' );
			return true;
		}
		if ( ! function_exists( 'edd_get_download_price' ) ) {
			self::transaction( 'ROLLBACK' );
			return new WP_Error( 'edd_required', 'Easy Digital Downloads must be active.' );
		}
		$price = edd_get_download_price( $id );
		if ( function_exists( 'edd_has_variable_prices' ) && edd_has_variable_prices( $id ) ) {
			$price = edd_get_lowest_price_option( $id );
		}
		$categories = get_the_terms( $id, 'download_category' );
		$tags = get_the_terms( $id, 'download_tag' );
		if ( is_wp_error( $categories ) || is_wp_error( $tags ) ) {
			self::transaction( 'ROLLBACK' );
			return new WP_Error( 'taxonomy_read_failed', 'Could not read product taxonomy.' );
		}
		$categories = $categories ?: array();
		$tags = $tags ?: array();
		usort( $tags, function ( $a, $b ) { return $a->term_id <=> $b->term_id; } );
		$tags = apply_filters( 'ch_search_curated_tags', $tags, $id );
		$files = array_filter( array_map( 'trim', explode( ',', get_post_meta( $id, 'file_type', true ) ) ) );
		$apps = array_filter( array_map( 'trim', explode( ',', get_post_meta( $id, 'compatible_with', true ) ) ) );
		$image_id = get_post_thumbnail_id( $id );
		$image = $image_id ? wp_get_attachment_image_src( $image_id, 'medium' ) : false;
		$card = array(
			'id' => (int) $id, 'slug' => $post->post_name, 'title' => $post->post_title,
			'price' => array( 'amount' => (float) $price, 'currency' => edd_get_currency() ),
			'categories' => array(), 'featured' => '1' === get_post_meta( $id, 'edd_feature_download', true ),
			'file_type' => implode( ', ', $files ), 'file_size' => get_post_meta( $id, 'file_size', true ),
			'image' => $image ? array( 'id' => $image_id, 'url' => $image[0], 'width' => $image[1], 'height' => $image[2], 'alt' => get_post_meta( $image_id, '_wp_attachment_image_alt', true ) ) : null,
		);
		$facets = array();
		foreach ( $categories as $term ) {
			$card['categories'][] = array( 'id' => $term->term_id, 'slug' => $term->slug, 'name' => $term->name );
			$facets['category'][ $term->slug ] = $term->name;
			foreach ( get_ancestors( $term->term_id, 'download_category', 'taxonomy' ) as $ancestor ) {
				$parent = get_term( $ancestor, 'download_category' );
				if ( $parent && ! is_wp_error( $parent ) ) { $facets['category'][ $parent->slug ] = $parent->name; }
			}
		}
		foreach ( $files as $file ) { $facets['fileType'][ strtoupper( $file ) ] = strtoupper( $file ); }
		foreach ( $apps as $app ) {
			$facets['app'][ strtolower( $app ) ] = $app;
			// Match existing UI's Illustrator/Photoshop shorthand.
			foreach ( self::tokens( $app ) as $token ) { $facets['app'][ $token ] = $app; }
		}
		// No rating/sale/licence metadata is inferred; sites can explicitly supply it.
		$extra = apply_filters( 'ch_search_product_attributes', array( 'rating' => 0, 'on_sale' => false, 'licenses' => array() ), $id );
		foreach ( $extra['licenses'] as $license ) { $facets['license'][ $license ] = $license; }
		$weights = array();
		$sources = array(
			8 => $post->post_title,
			3 => implode( ' ', array_merge( array_keys( $facets['category'] ?? array() ), array_values( $facets['category'] ?? array() ), wp_list_pluck( array_slice( $tags, 0, 24 ), 'name' ), $files, $apps ) ),
			1 => substr( wp_strip_all_tags( strip_shortcodes( $post->post_excerpt ) ), 0, 1000 ),
		);
		foreach ( $sources as $weight => $text ) {
			foreach ( self::tokens( $text ) as $word ) { $weights[ $word ] = max( $weight, $weights[ $word ] ?? 0 ); }
		}
		$ok = $wpdb->insert( self::table( 'documents' ), array(
			'product_id' => $id, 'title' => $post->post_title, 'price' => max( 0, round( $price * 100 ) ),
			'published' => $post->post_date_gmt, 'sales' => max( 0, (int) get_post_meta( $id, '_edd_download_sales', true ) ),
			'rating' => max( 0, min( 5, (float) $extra['rating'] ) ), 'on_sale' => (int) (bool) $extra['on_sale'], 'card' => wp_json_encode( $card ),
		) );
		$token_rows = array();
		foreach ( $weights as $word => $weight ) { $token_rows[] = $wpdb->prepare( '(%s,%d,%d)', $word, $id, $weight ); }
		foreach ( array_chunk( $token_rows, 100 ) as $chunk ) {
			if ( false === $wpdb->query( 'INSERT INTO ' . self::table( 'tokens' ) . ' (word,product_id,weight) VALUES ' . implode( ',', $chunk ) ) ) { $ok = false; break; }
		}
		$facet_rows = array();
		foreach ( $facets as $kind => $values ) {
			foreach ( $values as $value => $label ) {
				$facet_rows[] = $wpdb->prepare( '(%s,%s,%d,%s)', $kind, $value, $id, $label );
			}
		}
		foreach ( array_chunk( $facet_rows, 100 ) as $chunk ) {
			if ( false === $wpdb->query( 'INSERT INTO ' . self::table( 'facets' ) . ' (kind,value,product_id,label) VALUES ' . implode( ',', $chunk ) ) ) { $ok = false; break; }
		}
		self::transaction( false === $ok ? 'ROLLBACK' : 'COMMIT' );
		return false === $ok ? new WP_Error( 'search_index_write_failed', 'Could not write search index.' ) : true;
	}

	/** Keyset batches prevent growing offsets and unbounded PHP memory during indexing. */
	private static function batch( $after ) {
		global $wpdb;
		return $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type='download' AND ID > %d ORDER BY ID LIMIT 100", $after ) );
	}

	public static function refresh_batch() {
		$cursor = (int) get_option( 'ch_search_refresh_cursor', 0 );
		$ids = self::batch( $cursor );
		foreach ( $ids as $id ) {
			if ( is_wp_error( self::index_product( $id ) ) ) {
				wp_schedule_single_event( time() + 60, 'ch_search_refresh' ); return;
			}
			update_option( 'ch_search_refresh_cursor', (int) $id, false );
		}
		if ( $ids ) { wp_schedule_single_event( time() + 1, 'ch_search_refresh' ); }
	}

	public static function reindex( $args, $assoc_args ) {
		global $wpdb;
		$lock = $wpdb->prefix . 'ch_search_build';
		if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s,0)', $lock ) ) ) { WP_CLI::error( 'Another search build is running.' ); }
		self::install();
		$cursor = (int) get_option( 'ch_search_build_cursor', 0 );
		if ( get_option( 'ch_search_ready' ) || isset( $assoc_args['restart'] ) ) { $cursor = 0; }
		$count = 0;
		while ( $ids = self::batch( $cursor ) ) {
			_prime_post_caches( $ids, true, true );
			$thumbnails = array_filter( array_map( 'get_post_thumbnail_id', $ids ) );
			if ( $thumbnails ) { _prime_post_caches( $thumbnails, false, true ); }
			$wpdb->query( 'START TRANSACTION' );
			self::$batch_transaction = true;
			foreach ( $ids as $id ) {
				$result = self::index_product( $id );
				if ( is_wp_error( $result ) ) { $wpdb->query( 'ROLLBACK' ); WP_CLI::error( $result->get_error_message() ); }
				$cursor = (int) $id;
				++$count;
			}
			self::$batch_transaction = false;
			if ( false === $wpdb->query( 'COMMIT' ) ) { WP_CLI::error( 'Index commit failed.' ); }
			update_option( 'ch_search_build_cursor', $cursor, false );
			WP_CLI::log( "Processed $count products (through ID $cursor)." );
			wp_cache_flush_runtime();
		}
		// Reconcile rows orphaned by direct SQL deletions/imports.
		foreach ( array( 'documents', 'tokens', 'facets' ) as $suffix ) {
			$table = self::table( $suffix );
			$source = 'documents' === $suffix ? $wpdb->posts : self::table( 'documents' );
			$source_id = 'documents' === $suffix ? 'ID' : 'product_id';
			if ( false === $wpdb->query( "DELETE s FROM $table s LEFT JOIN $source p ON p.$source_id=s.product_id WHERE p.$source_id IS NULL" ) ) { WP_CLI::error( 'Index cleanup failed.' ); }
		}
		update_option( 'ch_search_ready', true, false );
		update_option( 'ch_search_indexed_at', gmdate( 'c' ), false );
		delete_option( 'ch_search_build_cursor' );
		$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) );
		WP_CLI::success( "Indexed $count downloads. Search is ready." );
	}

	public static function status() {
		global $wpdb;
		WP_CLI::log( wp_json_encode( array( 'ready' => (bool) get_option( 'ch_search_ready' ), 'indexed_at' => get_option( 'ch_search_indexed_at' ), 'documents' => (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . self::table( 'documents' ) ), 'tokens' => (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . self::table( 'tokens' ) ) ) ) );
	}

	public static function valid_list( $value ) {
		if ( ! is_string( $value ) || strlen( $value ) > 800 ) { return false; }
		$items = explode( ',', $value );
		return count( $items ) <= 8 && ! array_filter( $items, function ( $item ) { return '' === trim( $item ) || strlen( $item ) > 100; } );
	}

	public static function routes() {
		$integer = function ( $value ) { return is_scalar( $value ) && preg_match( '/^\d{1,10}$/', (string) $value ); };
		$args = array(
			'q' => array( 'default' => '', 'validate_callback' => function ( $value ) { return is_string( $value ) && strlen( $value ) <= 160 && count( self::tokens( $value ) ) <= 8 && ( '' === trim( $value ) || count( self::tokens( $value ) ) > 0 ); } ),
			'page' => array( 'default' => 1, 'validate_callback' => function ( $value ) use ( $integer ) { return $integer( $value ) && $value >= 1 && $value <= 50000; } ),
			'per_page' => array( 'default' => 24, 'validate_callback' => function ( $value ) use ( $integer ) { return $integer( $value ) && $value >= 1 && $value <= 96; } ),
			'sort' => array( 'type' => 'string', 'default' => 'relevance', 'enum' => array( 'relevance', 'newest', 'oldest', 'price-asc', 'price-desc', 'title-asc', 'title-desc', 'rating', 'best-selling' ) ),
			'avail' => array( 'type' => 'string', 'enum' => array( 'free', 'paid' ) ),
			'collection' => array( 'validate_callback' => function ( $value ) { return is_string( $value ) && preg_match( '/^[a-z0-9-]{1,100}$/', $value ); } ),
			'sale' => array( 'type' => 'boolean' ),
			'rating' => array( 'type' => 'number', 'minimum' => 0, 'maximum' => 5 ),
		);
		foreach ( array( 'min', 'max' ) as $key ) { $args[ $key ] = array( 'validate_callback' => $integer ); }
		foreach ( array( 'cat', 'group', 'file', 'app', 'license' ) as $key ) { $args[ $key ] = array( 'validate_callback' => array( __CLASS__, 'valid_list' ) ); }
		// Dedicated path avoids overriding another plugin's pre-existing /search route.
		register_rest_route( 'ch/v1', '/indexed-search', array( 'methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => array( __CLASS__, 'search' ), 'args' => $args ) );
	}

	/** OR within each facet; AND between facets. Values are always prepared. */
	private static function facet_condition( $kind, $values ) {
		global $wpdb;
		$table = self::table( 'facets' );
		$slots = implode( ',', array_fill( 0, count( $values ), '%s' ) );
		return $wpdb->prepare( "EXISTS (SELECT 1 FROM $table f WHERE f.product_id=d.product_id AND f.kind=%s AND f.value IN ($slots))", array_merge( array( $kind ), $values ) );
	}

	public static function search( $request ) {
		global $wpdb;
		$started = microtime( true );
		if ( ! get_option( 'ch_search_ready' ) ) { return new WP_Error( 'search_not_ready', 'The catalogue search index has not been built.', array( 'status' => 503 ) ); }
		$q = trim( $request['q'] );
		$collections = apply_filters( 'ch_search_collection_queries', array(
			'maha-shivratri' => 'shivratri', 'republic-day' => 'republic day', 'vasant-panchami' => 'vasant panchami',
			'valentine-day' => 'valentine', 'navratri' => 'navratri', 'diwali' => 'diwali', 'holi' => 'holi',
			'eid-mubarak' => 'eid', 'independence-day' => 'independence day', 'ganesh-chaturthi' => 'ganesh',
			'logo-templates' => 'logo', 'instagram-banners' => 'instagram', 'bollywood' => 'bollywood',
		) );
		if ( $request['collection'] ) {
			if ( ! isset( $collections[ $request['collection'] ] ) ) { return new WP_Error( 'unknown_collection', 'Unknown collection.', array( 'status' => 400 ) ); }
			$q .= ' ' . $collections[ $request['collection'] ];
		}
		$documents = self::table( 'documents' );
		$tokens = self::table( 'tokens' );
		$facets = self::table( 'facets' );
		$joins = '';
		$scores = array();
		foreach ( self::tokens( $q ) as $i => $word ) {
			$prefix = $wpdb->esc_like( $word ) . '%';
			$joins .= $wpdb->prepare( " JOIN (SELECT product_id, MAX(weight) AS score FROM $tokens WHERE word LIKE %s GROUP BY product_id) t$i ON t$i.product_id=d.product_id", $prefix );
			$scores[] = "t$i.score";
		}
		// Live publication gate prevents stale index entries exposing drafts/protected products.
		$from = "FROM $documents d JOIN {$wpdb->posts} p ON p.ID=d.product_id $joins";
		$where = array( "p.post_type='download'", "p.post_status='publish'", "p.post_password=''" );
		foreach ( array( 'cat' => 'category', 'group' => 'category', 'file' => 'fileType', 'app' => 'app', 'license' => 'license' ) as $key => $kind ) {
			if ( $request[ $key ] ) {
				$values = array_map( 'trim', explode( ',', $request[ $key ] ) );
				if ( 'file' === $key ) { $values = array_map( 'strtoupper', $values ); }
				if ( 'app' === $key ) { $values = array_map( 'strtolower', $values ); }
				$where[] = self::facet_condition( $kind, $values );
			}
		}
		foreach ( array( 'min' => '>=', 'max' => '<=' ) as $key => $operator ) {
			if ( null !== $request[ $key ] ) { $where[] = $wpdb->prepare( "d.price $operator %d", $request[ $key ] ); }
		}
		if ( null !== $request['min'] && null !== $request['max'] && $request['min'] > $request['max'] ) { return new WP_Error( 'invalid_price_range', 'Minimum price exceeds maximum price.', array( 'status' => 400 ) ); }
		if ( 'free' === $request['avail'] ) { $where[] = 'd.price=0'; }
		if ( 'paid' === $request['avail'] ) { $where[] = 'd.price>0'; }
		if ( $request['rating'] ) { $where[] = $wpdb->prepare( 'd.rating >= %f', $request['rating'] ); }
		if ( $request['sale'] ) { $where[] = 'd.on_sale=1'; }
		$where_sql = ' WHERE ' . implode( ' AND ', $where );
		$score = $scores ? implode( '+', $scores ) : '0';
		// Materialize the authorized matching IDs once. Counts, paging and facets
		// reuse this small set rather than repeating token/publication joins.
		$matches = self::table( 'matches' );
		$wpdb->query( "DROP TEMPORARY TABLE IF EXISTS $matches" );
		if ( false === $wpdb->query( "CREATE TEMPORARY TABLE $matches (product_id bigint unsigned NOT NULL PRIMARY KEY,relevance smallint unsigned NOT NULL) ENGINE=MEMORY" ) ) { return self::query_error(); }
		if ( false === $wpdb->query( "INSERT INTO $matches SELECT d.product_id,($score) $from $where_sql" ) ) {
			$wpdb->query( "DROP TEMPORARY TABLE $matches" ); return self::query_error();
		}
		$from = "FROM $matches m JOIN $documents d ON d.product_id=m.product_id";
		$score = 'm.relevance';
		$orders = array( 'relevance' => 'relevance DESC,d.sales DESC', 'newest' => 'd.published DESC', 'oldest' => 'd.published ASC', 'price-asc' => 'd.price ASC', 'price-desc' => 'd.price DESC', 'title-asc' => 'd.title ASC', 'title-desc' => 'd.title DESC', 'rating' => 'd.rating DESC', 'best-selling' => 'd.sales DESC' );
		$total = $wpdb->get_var( "SELECT COUNT(*) FROM $matches" );
		if ( $wpdb->last_error ) { $wpdb->query( "DROP TEMPORARY TABLE $matches" ); return self::query_error(); }
		$size = (int) $request['per_page'];
		$pages = max( 1, (int) ceil( $total / $size ) );
		$page = min( (int) $request['page'], $pages );
		$order = $orders[ $request['sort'] ];
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT d.card, ($score) AS relevance $from ORDER BY $order,d.product_id DESC LIMIT %d OFFSET %d", $size, ( $page - 1 ) * $size ) );
		if ( $wpdb->last_error ) { $wpdb->query( "DROP TEMPORARY TABLE $matches" ); return self::query_error(); }
		$counts = $wpdb->get_results( "SELECT f.kind,f.value,MAX(f.label) AS label,COUNT(*) AS count FROM $matches m JOIN $facets f ON f.product_id=m.product_id WHERE f.kind IN ('category','fileType') GROUP BY f.kind,f.value ORDER BY count DESC,f.value ASC LIMIT 256" );
		if ( $wpdb->last_error ) { $wpdb->query( "DROP TEMPORARY TABLE $matches" ); return self::query_error(); }
		$wpdb->query( "DROP TEMPORARY TABLE $matches" );
		$output_facets = array();
		foreach ( array( 'category' => 'Category', 'fileType' => 'File type' ) as $kind => $label ) {
			$values = array();
			foreach ( $counts as $row ) {
				if ( $kind === $row->kind ) { $values[] = array( 'value' => $row->value, 'label' => $row->label, 'count' => (int) $row->count ); }
			}
			$output_facets[] = array( 'key' => $kind, 'label' => $label, 'values' => $values );
		}
		return rest_ensure_response( array(
			'success' => true, 'data' => array_map( function ( $row ) { return json_decode( $row->card, true ); }, $rows ),
			'pagination' => array( 'page' => $page, 'per_page' => $size, 'total' => (int) $total, 'total_pages' => $pages ),
			'facets' => $output_facets, 'took_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
		) );
	}

	private static function query_error() {
		return new WP_Error( 'search_unavailable', 'Catalogue search is temporarily unavailable.', array( 'status' => 503 ) );
	}
}
register_activation_hook( __FILE__, array( 'CH_Indexed_Search', 'install' ) );
CH_Indexed_Search::boot();
