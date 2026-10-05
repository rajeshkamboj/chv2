import Link from "next/link";
import Image from "next/image";
import { SearchBar } from "@/components/search";
import { popularSearches } from "@/lib/navigation";
import { SITE } from "@/lib/constants";
import { routes } from "@/lib/routes";
import { getCartService, getCategoryService } from "@/lib/services";
import { AuthStateLink } from "./AuthStateLink";
import { CartCountBadge } from "./CartCountBadge";
import { WishlistCountBadge } from "./WishlistCountBadge";
import { MobileMenu } from "./MobileMenu";
import { PrimaryNav } from "./PrimaryNav";
import styles from "./SiteHeader.module.css";

function Wordmark() {
  return (
    <Image src="/brand/creative-hatti-logo.png" alt={SITE.name}
      width={200} height={49} priority className={styles.brandLogo} />
  );
}

export async function SiteHeader() {
  // Static-safe by design: no session/cookie reads here, so catalogue
  // pages prerender + cache at the edge. Live counts and auth state
  // hydrate from mirror cookies in client badges below.
  const [categories, cart] = await Promise.all([
    getCategoryService().listCategories(),
    getCartService().getCart(),
  ]);
  const navCategories = categories.map((category) => ({
    name: category.name,
    slug: category.slug,
  }));

  return (
    <header className={styles.header}>
      <p className={styles.announcement}>
        Festive sale is live — up to 40% off invitations, patterns &amp; fonts.
      </p>
      <div className={styles.main}>
        <div className={`ch-container ${styles.mainInner}`}>
          <MobileMenu
            categories={categories}
            popularSearches={popularSearches}
            cartCount={cart.itemCount}
            className={styles.mobileMenu}
          />
          <Link
            href={routes.home()}
            className={styles.brandLink}
            aria-label={`${SITE.name} — home`}
          >
            <Wordmark />
          </Link>
          <div className={styles.searchDesktop}>
            <SearchBar
              id="site-search"
              categories={navCategories}
              popularSearches={popularSearches}
            />
          </div>
          <nav aria-label="Account" className={styles.actions}>
            <WishlistCountBadge />
            <AuthStateLink />
            <CartCountBadge initialCount={cart.itemCount} />
          </nav>
        </div>
        <div className={`ch-container ${styles.searchMobile}`}>
          <SearchBar
            id="site-search-mobile"
            categories={navCategories}
            popularSearches={popularSearches}
          />
        </div>
      </div>
      <PrimaryNav className={styles.primaryNav} />
    </header>
  );
}
