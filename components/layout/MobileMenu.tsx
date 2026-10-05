"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchBar } from "@/components/search";
import { Icon } from "@/components/ui";
import { WISHLIST_COUNT_COOKIE } from "@/lib/constants";
import { productNavigation } from "@/lib/navigation";
import { routes } from "@/lib/routes";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import styles from "./MobileMenu.module.css";

export interface MobileMenuProps {
  categories: Category[];
  popularSearches: string[];
  cartCount: number;
  className?: string;
}

function readWishlistCount(): number {
  if (typeof document === "undefined") return 0;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${WISHLIST_COUNT_COOKIE}=(\\d+)`),
  );
  const value = match?.[1];
  return value === undefined ? 0 : Number(value);
}

function destination(item: (typeof productNavigation)[number] | (typeof productNavigation)[number]["children"][number]) {
  return "href" in item ? item.href : routes.category(item.slug);
}

/**
 * Mobile navigation drawer. Rendered inside the server header but fully
 * client-interactive: focus-trapped dialog, Escape/overlay close, scroll
 * lock and focus restoration. Category names come from the centralized
 * taxonomy (`lib/taxonomy.ts`) — never duplicated here.
 */
export function MobileMenu({
  categories,
  popularSearches,
  cartCount,
  className,
}: MobileMenuProps) {
  // Mirror-cookie count, re-read after every navigation render so the
  // server header never touches the session (keeps pages static).
  const pathname = usePathname();
  const wishlistCount = pathname === null ? 0 : readWishlistCount();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  // Lock scroll + focus the panel on open; restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      // Lightweight focus trap.
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [open ]);

  return (
    <span className={cn(styles.root, className)}>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Icon name="menu" />
      </button>
      {open && (
        <span className={styles.portal}>
          <span
            className={styles.overlay}
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className={styles.panel}
          >
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Menu</span>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.menuButton}
                aria-label="Close menu"
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className={styles.panelSearch}>
              <SearchBar
                id="mobile-menu-search"
                categories={categories.map(({ name, slug }) => ({ name, slug }))}
                popularSearches={popularSearches}
              />
            </div>
            <nav aria-label="Mobile" className={styles.panelNav}>
              <section aria-label="Account shortcuts" className={styles.group}>
                <ul className={styles.shortcuts}>
                  <li>
                    <Link
                      href={routes.account()}
                      className={styles.shortcut}
                      onClick={close}
                    >
                      <Icon name="user" size={18} />
                      Account
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={routes.accountWishlist()}
                      className={styles.shortcut}
                      onClick={close}
                    >
                      <Icon name="heart" size={18} />
                      Wishlist
                      {wishlistCount > 0 && (
                        <span className={styles.count}>{wishlistCount}</span>
                      )}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={routes.cart()}
                      className={styles.shortcut}
                      onClick={close}
                    >
                      <Icon name="bag" size={18} />
                      Cart
                      {cartCount > 0 && (
                        <span className={styles.count}>{cartCount}</span>
                      )}
                    </Link>
                  </li>
                </ul>
              </section>
              {productNavigation.map((group) => (
                <section
                  key={group.label}
                  aria-label={group.label}
                  className={styles.group}
                >
                  <p className={styles.groupTitle}>
                    <Link
                      href={destination(group)}
                      className={styles.groupLink}
                      onClick={close}
                    >
                      {group.label}
                    </Link>
                  </p>
                  {group.children.length > 0 && (
                    <ul className={styles.links}>
                      {group.children.map((sub) => (
                        <li key={sub.slug}>
                          <Link
                            href={destination(sub)}
                            className={styles.link}
                            onClick={close}
                          >
                            {sub.label}
                            <Icon
                              name="chevron-right"
                              size={16}
                              className={styles.linkChevron}
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </nav>
          </div>
        </span>
      )}
    </span>
  );
}
