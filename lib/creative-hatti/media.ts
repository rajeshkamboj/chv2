const LOCAL_WORDPRESS_HOSTNAMES = new Set([
  "creativehatti.test",
  "www.creativehatti.test",
]);
const DEFAULT_PRODUCTION_WORDPRESS_URL = "https://www.creativehatti.com";

export function isLocalWordPressMediaUrl(value: string): boolean {
  try {
    return LOCAL_WORDPRESS_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function productionWordPressUrl(): URL {
  const configured =
    process.env.WORDPRESS_URL ??
    process.env.NEXT_PUBLIC_WORDPRESS_URL ??
    DEFAULT_PRODUCTION_WORDPRESS_URL;

  try {
    const url = new URL(configured);
    if (LOCAL_WORDPRESS_HOSTNAMES.has(url.hostname)) {
      return new URL(DEFAULT_PRODUCTION_WORDPRESS_URL);
    }
    return url;
  } catch {
    return new URL(DEFAULT_PRODUCTION_WORDPRESS_URL);
  }
}

export function productionWordPressHostname(): string {
  return productionWordPressUrl().hostname;
}

export function normalizeWordPressMediaUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!isLocalWordPressMediaUrl(value)) return value;
    // Keep staging and local API media URLs intact in development. Only
    // production builds translate local WordPress hosts to the configured
    // production media origin. Local databases can reference generated
    // WordPress size variants that were never created in the uploads folder;
    // use the attachment original when that conventional suffix is present.
    if (process.env.NODE_ENV !== "production") {
      url.pathname = url.pathname.replace(/-\d+x\d+(\.[^./]+)$/i, "$1");
      return url.toString();
    }
    const production = productionWordPressUrl();
    url.protocol = production.protocol;
    url.hostname = production.hostname;
    url.port = production.port;
    return url.toString();
  } catch {
    return value;
  }
}
