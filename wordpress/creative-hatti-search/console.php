<?php
/** Standalone PHP CLI entry point for installations without WP-CLI. */
if ( PHP_SAPI !== 'cli' ) { http_response_code( 404 ); exit; }
$options = getopt( '', array( 'path:', 'command:', 'url:' ) );
$path = isset( $options['path'] ) ? realpath( $options['path'] ) : false;
$command = $options['command'] ?? 'status';
if ( ! $path || ! is_file( $path . '/wp-load.php' ) || ! in_array( $command, array( 'activate', 'reindex', 'status' ), true ) ) {
	fwrite( STDERR, "Usage: php console.php --path=/path/to/wordpress --command=activate|reindex|status\n" ); exit( 1 );
}
$url = parse_url( $options['url'] ?? 'http://localhost' );
if ( ! $url || ! isset( $url['host'] ) || ! in_array( $url['scheme'] ?? '', array( 'http', 'https' ), true ) ) { fwrite( STDERR, "Invalid --url\n" ); exit( 1 ); }
// Laragon configurations can derive their site URL from the HTTP request.
$_SERVER['REQUEST_SCHEME'] = $url['scheme'];
$_SERVER['HTTP_HOST'] = $url['host'] . ( isset( $url['port'] ) ? ':' . $url['port'] : '' );
$_SERVER['SERVER_NAME'] = $url['host'];
require_once $path . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
if ( 'activate' === $command ) {
	$result = activate_plugin( 'creative-hatti-search/creative-hatti-search.php' );
	if ( is_wp_error( $result ) ) { fwrite( STDERR, $result->get_error_message() . "\n" ); exit( 1 ); }
	CH_Indexed_Search::install();
	echo "Search plugin active. Run reindex before using search.\n"; exit;
}
if ( ! class_exists( 'CH_Indexed_Search' ) ) { fwrite( STDERR, "Activate the search plugin first.\n" ); exit( 1 ); }
if ( ! class_exists( 'WP_CLI' ) ) {
	class WP_CLI {
		public static function log( $message ) { echo $message . "\n"; }
		public static function success( $message ) { echo $message . "\n"; }
		public static function error( $message ) { fwrite( STDERR, $message . "\n" ); exit( 1 ); }
	}
}
if ( 'reindex' === $command ) { CH_Indexed_Search::reindex( array(), array() ); }
else { CH_Indexed_Search::status(); }
