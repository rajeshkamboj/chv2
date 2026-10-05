"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { productNavigation } from "@/lib/navigation";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import styles from "./PrimaryNav.module.css";

export interface PrimaryNavProps {
  className?: string;
}

function destination(item: (typeof productNavigation)[number] | (typeof productNavigation)[number]["children"][number]) {
  return "href" in item ? item.href : routes.category(item.slug);
}

export function PrimaryNav({ className }: PrimaryNavProps) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openSlug) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenSlug(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSlug(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openSlug]);

  return (
    <nav ref={navRef} aria-label="Product categories" className={cn(styles.nav, className)}>
      <div className="ch-container">
        <ul className={styles.list}>
          {productNavigation.map((group) => {
            const isOpen = openSlug === group.label;
            return (
              <li key={group.label} className={styles.item}>
                <div className={styles.triggerRow}>
                  <Link href={destination(group)} className={styles.link}>
                    {group.label}
                  </Link>
                  {group.children.length > 0 && (
                    <button
                      type="button"
                      className={styles.disclosure}
                      aria-label={`${isOpen ? "Close" : "Open"} ${group.label} menu`}
                      aria-expanded={isOpen}
                      onClick={() => setOpenSlug(isOpen ? null : group.label)}
                    >
                      <Icon name="chevron-down" size={15} className={cn(styles.chevron, isOpen && styles.chevronOpen)} />
                    </button>
                  )}
                </div>
                {group.children.length > 0 && isOpen && (
                  <div className={styles.megaMenu}>
                    <div className={styles.megaHeading}>
                      <span>Browse {group.label}</span>
                      <Link href={destination(group)} onClick={() => setOpenSlug(null)}>
                        View all <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                    <ul className={styles.megaLinks}>
                      {group.children.map((child) => (
                        <li key={child.slug}>
                          <Link href={destination(child)} onClick={() => setOpenSlug(null)}>
                            <span>{child.label}</span>
                            <Icon name="chevron-right" size={15} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
