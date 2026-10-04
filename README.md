# Creative Hatti — Storefront (Next.js rebuild)

Clean Next.js rebuild of the Creative Hatti frontend — a digital creative
asset marketplace with 44,000+ products. This project will eventually replace
the WordPress + Mayosis + Easy Digital Downloads frontend.

> **Status: frontend complete through Run 12 (production polish + QA).**
> Storefront, search, listings, product, cart, checkout, auth and the full
> account area run against the mock service layer. No real backend, payments
> or storage yet — connecting those is the next stage, and every seam for
> it is already in place (see `lib/services`, `lib/api`, `.env.example`).

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict)
- CSS Modules + CSS custom-property design tokens (no CSS framework)
- Self-hosted variable fonts (Inter + Fraunces via Fontsource — no Google
  Fonts round-trip, builds work offline)
- Runtime dependencies limited to Next.js, React and font assets

## Quick start

```bash
cp .env.example .env.local   # optional; mock mode works without it
npm install
npm run dev                  # http://localhost:3000
```

| Script            | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Development server                        |
| `npm run build`   | Production build (also type-checks)       |
| `npm run start`   | Serve a production build                  |
| `npm run lint`    | ESLint (Next.js core-web-vitals + TS)     |
| `npm run typecheck` | `tsc --noEmit`                          |

## Architecture

```
                     ┌──────────────────────┐
                     │  Cloudflare / CDN    │  (future)
                     └──────────┬───────────┘
                                ▼
┌──────────────────────────────────────────────┐
│  Next.js App Router (this repo)              │
│                                              │
│  app/            routes, layouts, metadata   │
│  components/     ui · layout · product ·     │
│                  search · cart · account     │
│  lib/services    ProductService, Search…     │  ← pages/components
│  lib/api         typed fetch client +        │     stop here; they
│                  endpoint builders          │     never touch fetch/data
│  lib/types       domain model                │
│  lib/utils       formatting, pagination, cn  │
│  data/           mock catalogue (dev only)   │
└──────────────────────┬───────────────────────┘
                       ▼
            ┌─────────────────────┐
            │  API (future)       │  Database / Search / Auth
            └─────────┬───────────┘
                      ▼
            Razorpay + AWS S3 (backend only —
            secrets must never enter this repo)
```

### Data-flow rules

1. **Pages and components fetch only through `lib/services` accessors**
   (`getProductService()`, `getSearchService()`, …). Never `fetch()` directly,
   never import from `@/data` or `@/lib/api` in components.
2. **Every service has an interface + mock implementation today** and an
   API-backed implementation behind `USE_MOCK_API=false` for read paths.
   Swapping to the real backend changes services, not components.
3. **Catalogue reads are server-side, paginated and cached**
   (`lib/cache.ts` revalidation windows + tags). The browser only ever
   receives the current page — never thousands of products.
4. URLs are built via `lib/routes.ts`; money renders via `formatMoney()`.
5. **Client components mutate through server actions** (`app/*/actions.ts`),
   which call services — never import services or `@/data` from client code.
   Session state (cart) syncs to the UI via cookies + `revalidatePath`.
6. **Auth lives in the service layer, enforced on the server.** Components
   never hold auth logic; `requireUser()` (`lib/auth.ts`) redirects
   signed-out visitors from `/account/*` layouts. The session is an
   httpOnly cookie — nav hiding is UX only, never security.

### Category + collection listings (Run 06)

- `/category/[slug]` serves taxonomy groups (Vector Creatives, Character
  Bundle, Freebies) and subcategories (Flyers, Mythological, …);
  `/collections/[slug]` serves curated collections (Diwali, Holi,
  Logo Templates, …). One dynamic route each — no manual pages.
- Both reuse the search pipeline: the slug becomes a base constraint
  (group → `groups`, subcategory → `categorySlugs`, collection →
  collection id) merged with URL filters, then `searchProducts()`.
  Shared UI: `ProductGrid`, `FilterPanel`/`FilterDrawer`,
  `ActiveFilters`, `SortSelect`, `NoResults`, `ListingPage.module.css`.
- Dynamic title / description / canonical / OG per slug. Legacy
  `/categories/:slug` URLs permanently redirect (308) to
  `/category/:slug`.
- No `loading.tsx` in these segments on purpose: a Suspense fallback
  would absorb `notFound()` and serve unknown slugs as HTTP 200
  (vercel/next.js#98954). Unknown slugs return 404 + noindex and the
  not-found UI hydrates from the Flight payload; per the same
  upstream issue the SSR body of a `notFound()` 404 is an empty
  shell for no-JS clients, while unmatched URLs render the full
  not-found page server-side.

### Cart + checkout (Run 08)

- `/cart` (session lines with license picker, remove, wishlist toggle,
  totals) and `/checkout` (customer info, coupon, Razorpay method,
  terms, place order) plus `/checkout/pay|success|failed` order steps.
- Mock backend: cookie-session cart + in-memory orders with a `HATTI10`
  (10% off) test coupon. The header badge stays static-safe via the
  cart-count cookie. Real mode (`USE_MOCK_API=false`) calls the typed
  API, including `POST /v1/payments/verify`.
- Razorpay is integration-ready: `lib/payments/razorpay.ts` opens
  checkout.js with a backend-created order id; only the publishable key
  id is browser-safe — secrets and S3 credentials stay backend-only.
  Mock mode drives states through an explicitly labelled test sandbox;
  nothing fakes a real payment.

### Auth + account (Run 09)

- `/login` (remember-me, forgot/register links), `/register`, `/forgot-password`
  (generic success state) and `/reset-password` (opaque token, expiry + invalid
  states). All noindex; signed-in visitors bounce to their destination.
- `AuthService` (`login`/`register`/`logout`/`getCurrentUser`/
  `forgotPassword`/`resetPassword` + activation resend) with a cookie-session
  mock and typed `/v1/auth/*` API stubs. Classic-store (WordPress/EDD) emails
  are never password-guessed: the mock returns a `legacy-account` code that
  routes them to password reset, and pending accounts to activation resend.
- `/account/*` shell (dashboard, profile, orders, downloads, wishlist,
  licenses, settings, logout) guarded by the account layout via
  `requireUser()` — server-side redirects, with `?next=` validated against
  open redirects. Orders/downloads/wishlist shell pages read the existing
  mock services; licences note they arrive with purchase history.
- Mock demo: `demo@creativehatti.com` / `demo1234` (active),
  `pending@creativehatti.com` / `demo1234` (activation),
  `legacy@creativehatti.com` (classic-store reset path).

### Customer dashboard + digital library (Run 10)

- `/account` dashboard: recent orders, recent downloads, wishlist count
  and account info. `/account/orders` history (number, date, status,
  total, product count, view link) plus `/account/orders/[id]` detail
  with payment reference, per-line license info (from the real license
  definitions) and per-line download buttons for paid orders.
- `/account/downloads` lists product, purchase date, remaining
  downloads, conditional access expiry and a per-click download button.
  The button calls `requestDownloadUrl(productId, orderId)`; mock mode
  serves a placeholder file from `/api/mock-downloads/*`, production
  returns a backend-signed short-lived S3 URL. No AWS credentials
  anywhere near the frontend.
- `/account/wishlist` is a session-backed grid (seeded with real
  products) with working remove, add-to-cart and an empty state.
  `/account/licenses` shows owned keys with status, order links and
  backend-supplied expiry/activation rows only when present — no
  invented licensing rules. `/account/settings` edits profile name,
  shows email + password paths and persists notification preferences.
- Mock library grew honestly: paid + failed sample orders, matching
  downloads and keys, all referencing real catalogue products. Account
  area is responsive (stacked shell, wrapping rows, scrolling nav).

### SEO + performance (Run 11)

- Metadata everywhere: dynamic titles/descriptions/canonicals on
  products, categories, collections and search (search is
  `noindex,follow`), root title template, `metadataBase`, OG/Twitter
  cards with generated PNGs (`/opengraph-image`,
  `/product/[slug]/opengraph-image`), Product + Breadcrumb JSON-LD via
  the `JsonLd` helper (ratings/offers emitted only when data exists).
- Chunked sitemaps (`/sitemap/0.xml` static + taxonomy, `/sitemap/1..N.xml`
  products at 10k URLs per file for the 44k+ catalogue) listed in
  `robots.ts`, which also keeps `/api`, cart, checkout, account,
  wishlist and auth recovery out of crawl budget. Legacy
  `/categories`/`/products` redirect to clean URLs; no WP/EDD paths
  are exposed anywhere.
- Render strategy: home is static (1d), the 25 merchandised products
  are SSG + ISR (30m), the rest of the catalogue renders on demand
  with ISR — never a full 44k pre-render. Listings stay dynamic (URL
  filters) with cached service reads and CDN HTML caching by full URL.
- Images all flow through one `ProductImage` wrapper (`next/image`,
  correct `sizes`, aspect-ratio slots against CLS, lazy except the
  gallery hero); self-hosted variable fonts, no Google round-trip.
  Header/footer render static-safe: auth + wishlist state hydrates via
  `ch_auth_state`/`ch_wishlist_count` mirror cookies (server actions
  still enforce everything), so anonymous HTML stays cacheable.
- Security headers on every response (HSTS in production, nosniff,
  referrer/permission policies); secrets scan clean — Razorpay/AWS
  credentials remain backend-only by design.

### Final QA + polish (Run 12)

- Every route probed (home, search, category, collection, product,
  cart, checkout + pay/success/failed, login, register, recovery,
  account + profile/orders/downloads/wishlist/licenses/settings,
  404): correct statuses, exactly one `h1`, no skipped heading
  levels, every image/label/button/link named for assistive tech.
- Contrast audited pair-by-pair — `text-faint` now clears 4.5:1;
  responsive audit (320px → 1920px) found zero fixed-width overflow
  risks; drawers/lightbox are viewport-capped; dialogs trap focus
  with Escape + focus restoration; breadcrumb ellipsis fixed.
- Dead `/wishlist` helper removed (header/footer/menu now link the
  real `/account/wishlist`); bare `/categories` → `/`, `/products`
  → `/search` redirects added; login explains guarded bounces;
  404 copy de-jargonised; OG price uses shared `formatMoney`.
- No new dependencies, no architectural changes, no console output
  or TODOs in shipped code; lint + `tsc` clean.

## Project structure

### Indexed catalogue search

Real search uses the dedicated WordPress/EDD index in
[`wordpress/creative-hatti-search`](wordpress/creative-hatti-search/README.md).
Install and activate that plugin, build the catalogue with `wp ch-search reindex`,
then set server-only `CH_API_URL` and `USE_MOCK_API=false`. The existing Next.js
search, category and collection listings call `/indexed-search` through their
search service, forwarding queries, multiselect filters, sorting and pagination.
Only the current result page reaches the browser. See the plugin guide for the
API contract, Laragon CLI commands, index synchronization and verification.

```
app/                  layout, homepage, search, category + collection listings,
                      product + cart + checkout pages, auth + account pages
styles/tokens.css     design tokens (single source of truth)
components/
  ui/                 Button, IconButton, Icon, Input, Badge, Card, Spinner,
                      EmptyState, Pagination
  layout/             Container, SiteHeader, PrimaryNav, MobileMenu,
                      Breadcrumbs, SiteFooter
  product/            ProductCard, ProductGrid
  search/             SearchBar
  cart/               CartItemRow, CartSummary, CartLicenseSelect
  checkout/           SubmitButton, RazorpayButton
  auth/               AuthCard (shared login/register/recovery shell)
  account/            AccountMenu, AccountSidebar, DownloadButton,
                      WishlistItemCard
lib/
  types/              Product, Category, ProductImage, Customer, AuthUser,
                      AuthErrorCode (+ inputs), Cart, CartItem,
                      Order, OrderItem, Download, WishlistItem, License,
                      SearchResult, Pagination (+ common primitives)
  services/           interfaces + mock/API implementations + accessors
  api/                typed client (ApiError, apiFetch) + endpoint builders
  payments/           Razorpay checkout.js client (publishable key only)
  utils/              cn, format (INR/dates/files), pagination helpers
  auth.ts             requireUser() guard + safe ?next= validation
  constants.ts        site + pagination defaults (env-aware, browser-safe)
  routes.ts           storefront URL builders (incl. placeholder routes)
  navigation.ts       popular searches + nav config (API-owned in future)
  homepage.ts         discovery tiles, character cats, keywords (Run 03)
  taxonomy.ts         product groups/subcategories — single source of truth
  cache.ts            ISR revalidation windows + cache tags
  design-tokens.ts    TS mirror of breakpoints/containers
data/                 mock licences, taxonomy categories, collections, 53-product seed
public/               favicon (robots + sitemaps are dynamic routes)
```

## Design system

Tokens in `styles/tokens.css` cover typography (Inter UI + Fraunces display),
type scale, weights, spacing, radius, shadows, containers, breakpoints,
buttons, inputs, cards, badges and links. Components consume tokens via CSS
Modules — no hardcoded colours, spacing or breakpoints.

Deliberately **restrained**: warm paper neutrals, one deep-green brand colour,
marigold reserved for ratings/highlights, flat placeholder art (no gradients),
subtle shadows, minimal motion with `prefers-reduced-motion` support.

## Environment

See `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser.
`USE_MOCK_API=false` + `NEXT_PUBLIC_API_BASE_URL` (or server-only
`API_BASE_URL`) switches read paths to the typed API client. Mock mode
(`true`, default) uses the cookie-session cart, in-memory orders and the
test payment sandbox. Real payments need the backend plus
`NEXT_PUBLIC_RAZORPAY_KEY_ID` (publishable key id — safe for browsers).
Payment and storage credentials are backend-only and must never be added
here.

## Key architectural decisions

- **Service layer seam.** UI never fetches directly: every read/write
  goes through typed services in `lib/services` with mock and API
  implementations behind `getXService()` accessors. Flipping
  `USE_MOCK_API=false` swaps data sources without touching a page.
- **Money in minor units.** All prices are `{ amount, currency }` in
  paise, rendered only via `formatMoney` — no float math, no ad-hoc
  `₹` strings outside static filter labels.
- **Cookie sessions, guarded server-side.** Auth/cart/wishlist state
  lives in HTTP-only session cookies; `requireUser()` protects
  account routes and every mutation re-checks on the server. The
  non-HTTP-only `ch_auth_state` / `ch_wishlist_count` / cart-count
  mirrors exist only so the static shell can hydrate badges.
- **Render only what's needed.** Static home, SSG + ISR for the 25
  merchandised products, on-demand ISR for the rest of the 44k+
  catalogue, dynamic URL-driven listings — never a full pre-render.
- **`notFound()` over skeletons.** Product/category/collection pages
  deliberately ship no `loading.tsx`: a Suspense fallback would
  swallow `notFound()` and serve HTTP 200 forever
  (vercel/next.js#98954). Search (which can't 404) has the skeleton.
- **Secrets stay backend.** Razorpay/AWS credentials are not modelled
  anywhere in this repo — payments verify and downloads sign
  server-side; the frontend only ever holds publishable keys.
- **Placeholder routes are explicit.** `lib/routes.ts` documents
  which paths (marketing/legal/discovery) intentionally render the
  branded 404 until that content exists — no silent dead ends.

## Project status

Shipped (Runs 01–12): foundation + design system, homepage,
taxonomy, search, category/collection listings, product pages,
session cart + Razorpay-ready checkout, auth + guarded account
shell, dashboard/downloads/wishlist/licenses, SEO + chunked
sitemaps + ISR strategy, final accessibility/responsive QA.

Next stage — connecting the real backend/data:

- Point `USE_MOCK_API=false` at the catalogue API; land CDN imagery
  (the `ProductImage` wrapper + `remotePatterns` are ready).
- Real auth sessions, account migration + activation from the
  classic store, backend-verified Razorpay capture.
- Signed short-lived download URLs via `requestDownloadUrl()`.
- Marketing/legal content pages, cart drawer, listing wishlist sync.
