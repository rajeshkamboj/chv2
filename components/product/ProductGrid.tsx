import type { ReactNode } from "react";
import { EmptyState, Pagination } from "@/components/ui";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "./ProductCard";
import styles from "./ProductGrid.module.css";

export interface ProductGridPagination {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

export interface ProductGridEmpty {
  title: string;
  description?: string;
  action?: ReactNode;
}

export interface ProductGridProps {
  products: Product[];
  artworkPreview?: boolean;
  masonry?: boolean;
  className?: string;
  /** Total catalogue count for the "N products" line. Omit to hide. */
  totalItems?: number;
  pagination?: ProductGridPagination | null;
  empty?: ProductGridEmpty;
  /** Card title level for the heading hierarchy of the host page. */
  cardTitleAs?: "h2" | "h3";
}

const DEFAULT_EMPTY: ProductGridEmpty = {
  title: "No products found",
  description: "Try a different search or browse the categories.",
};

export function ProductGrid({
  products,
  className,
  totalItems,
  pagination = null,
  empty = DEFAULT_EMPTY,
  cardTitleAs,
  artworkPreview = false,
  masonry = false,
}: ProductGridProps) {
  return (
    <div className={cn(styles.wrapper, className)}>
      {totalItems !== undefined && (
        <p className={styles.count} role="status">
          {totalItems} {totalItems === 1 ? "product" : "products"}
        </p>
      )}
      {products.length === 0 ? (
        <EmptyState
          title={empty.title}
          description={empty.description}
          action={empty.action}
        />
      ) : (
        <ul className={cn(styles.grid, masonry && styles.masonry)}>
          {products.map((product) => (
            <li key={product.id} className={styles.cell}>
              <ProductCard product={product} titleAs={cardTitleAs} artworkPreview={artworkPreview} />
            </li>
          ))}
        </ul>
      )}
      {pagination && pagination.totalPages > 1 && (
        <div className={styles.pagination}>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            buildHref={pagination.buildHref}
          />
        </div>
      )}
    </div>
  );
}
