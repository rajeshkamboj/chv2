/**
 * Site-wide constants. Browser-safe (no secrets here, ever).
 */

export const SITE = {
  name: "Creative Hatti",
  tagline: "Premium digital creative assets",
  description:
    "Creative Hatti is a curated marketplace for fonts, graphics, templates and design resources.",
  locale: "en-IN",
  currency: "INR",
    url: readSiteUrl(),
} as const;

export const PAGINATION = {
  defaultPageSize: readEnvInt("NEXT_PUBLIC_DEFAULT_PAGE_SIZE", 24, 1, 96),
  maxPageSize: 96,
  /** How many page buttons the Pagination component renders around current. */
  siblingCount: 1,
} as const;

/** Show verified rating and sales signals on product cards and detail pages. */
export const SHOW_PRODUCT_SOCIAL_PROOF = false;

function readSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return raw ? raw : "https://www.creativehatti.com";
}

function readEnvInt(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const CART_COOKIE = "ch_cart";
/** Non-httpOnly mirror of the item count so the header badge stays live. */
export const CART_COUNT_COOKIE = "ch_cart_count";
/** HttpOnly session id for the signed-in customer (mock + backend). */
export const AUTH_SESSION_COOKIE = "ch_session";
/**
 * Non-httpOnly login mirror (`"1"` when signed in, absent otherwise) so
 * the static header can render the right link without reading the
 * httpOnly session. Leaks no identity — enforcement stays server-side.
 */
export const AUTH_STATE_COOKIE = "ch_auth_state";
/** HttpOnly session id for the guest/customer wishlist (mock + backend). */
export const WISHLIST_COOKIE = "ch_wishlist";
/** Non-httpOnly wishlist count mirror for the static header badge. */
export const WISHLIST_COUNT_COOKIE = "ch_wishlist_count";

/**
 * Window event fired after same-page cart mutations (product-page
 * add-to-cart) with `{ count: number }` detail for the header badge.
 */
export const CART_UPDATED_EVENT = "ch:cart-updated";
