<?php
/** Real WordPress integration test. Creates and removes only its own fixture. */
if ( PHP_SAPI !== 'cli' ) { exit; }
$options = getopt( '', array( 'path:', 'url:' ) );
$path = realpath( $options['path'] ?? '' );
$url = parse_url( $options['url'] ?? 'http://localhost' );
if ( ! $path || ! is_file( $path . '/wp-load.php' ) || empty( $url['host'] ) ) { fwrite( STDERR, "Use --path=WORDPRESS --url=SITE\n" ); exit( 1 ); }
$_SERVER['REQUEST_SCHEME'] = $url['scheme'];
$_SERVER['HTTP_HOST'] = $url['host'] . ( isset( $url['port'] ) ? ':' . $url['port'] : '' );
require_once $path . '/wp-load.php';
if ( ! class_exists( 'CH_Indexed_Search' ) || ! get_option( 'ch_search_ready' ) ) { fwrite( STDERR, "Build the index first.\n" ); exit( 1 ); }

function check( $condition, $message ) {
	if ( ! $condition ) { throw new RuntimeException( $message ); }
	echo "PASS $message\n";
}
function find_products( $params ) {
	$request = new WP_REST_Request( 'GET', '/ch/v1/indexed-search' );
	$request->set_query_params( $params );
	$response = rest_do_request( $request );
	check( 200 === $response->get_status(), 'search request succeeds' );
	return $response->get_data();
}

$id = 0;
$second_id = 0;
$failed = false;
$word = 'fixture' . bin2hex( random_bytes( 6 ) );
try {
	$id = wp_insert_post( array( 'post_type' => 'download', 'post_status' => 'publish', 'post_title' => $word . ' Diwali vector' ), true );
	check( ! is_wp_error( $id ), 'create fixture' );
	update_post_meta( $id, 'edd_price', '12.34' );
	update_post_meta( $id, 'file_type', 'EPS, PNG' );
	update_post_meta( $id, 'compatible_with', 'Adobe Illustrator' );
	CH_Indexed_Search::flush();
	$result = find_products( array( 'q' => $word, 'min' => 1234, 'max' => 1234, 'file' => 'EPS', 'app' => 'illustrator' ) );
	check( 1 === $result['pagination']['total'] && (int) $result['data'][0]['id'] === $id, 'metadata and paise filters match' );
	check( abs( $result['data'][0]['price']['amount'] - 12.34 ) < 0.001, 'DTO price remains in rupees' );
	check( 2 === count( $result['facets'][1]['values'] ), 'file facets cover matched product' );
	$result = find_products( array( 'q' => $word . ' nonexistenttoken' ) );
	check( 0 === $result['pagination']['total'], 'all query tokens required' );
	$second_id = wp_insert_post( array( 'post_type' => 'download', 'post_status' => 'publish', 'post_title' => 'Other searchable item', 'post_excerpt' => $word ), true );
	CH_Indexed_Search::flush();
	$result = find_products( array( 'q' => $word ) );
	check( (int) $result['data'][0]['id'] === $id, 'title match outranks excerpt match' );
	wp_delete_post( $second_id, true ); $second_id = 0;

	$categories = get_terms( array( 'taxonomy' => 'download_category', 'hide_empty' => false, 'number' => 2 ) );
	check( ! is_wp_error( $categories ) && count( $categories ) >= 2, 'existing categories available' );
	wp_set_object_terms( $id, array( $categories[0]->term_id ), 'download_category' );
	CH_Indexed_Search::flush();
	$result = find_products( array( 'q' => $word, 'cat' => $categories[0]->slug . ',' . $categories[1]->slug ) );
	check( 1 === $result['pagination']['total'], 'multiselect categories use OR' );
	$ancestor_ids = get_ancestors( $categories[0]->term_id, 'download_category', 'taxonomy' );
	if ( $ancestor_ids ) {
		$ancestor = get_term( $ancestor_ids[0], 'download_category' );
		$result = find_products( array( 'q' => $word, 'group' => $ancestor->slug ) );
		check( 1 === $result['pagination']['total'], 'ancestor group filter matches' );
	}
	update_post_meta( $id, 'edd_price', '0' ); CH_Indexed_Search::flush();
	$result = find_products( array( 'q' => $word, 'avail' => 'free' ) );
	check( 1 === $result['pagination']['total'], 'price update changes availability' );
	wp_update_post( array( 'ID' => $id, 'post_password' => 'fixture-password' ) ); CH_Indexed_Search::flush();
	check( 0 === find_products( array( 'q' => $word ) )['pagination']['total'], 'password-protected product excluded' );
	wp_update_post( array( 'ID' => $id, 'post_password' => '', 'post_status' => 'draft' ) ); CH_Indexed_Search::flush();
	check( 0 === find_products( array( 'q' => $word ) )['pagination']['total'], 'draft product excluded' );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish', 'post_title' => $word . ' Updated' ) ); CH_Indexed_Search::flush();
	$result = find_products( array( 'q' => $word . ' updated' ) );
	check( 1 === $result['pagination']['total'], 'republishing updates searchable title' );
	wp_delete_post( $id, true ); $id = 0;
	check( 0 === find_products( array( 'q' => $word ) )['pagination']['total'], 'deleted product removed' );
} catch ( Throwable $error ) {
	$failed = true;
	fwrite( STDERR, 'FAIL ' . $error->getMessage() . "\n" );
} finally {
	if ( is_int( $id ) && $id > 0 ) { wp_delete_post( $id, true ); }
	if ( is_int( $second_id ) && $second_id > 0 ) { wp_delete_post( $second_id, true ); }
	CH_Indexed_Search::flush();
}
exit( $failed ? 1 : 0 );
