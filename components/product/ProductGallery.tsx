"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, TouchEvent } from "react";
import { Icon } from "@/components/ui";
import type { ProductImage } from "@/lib/types";
import { ProductImage as ProductImageView } from "./ProductImage";
import { cn } from "@/lib/utils";
import styles from "./ProductGallery.module.css";

export interface ProductGalleryProps {
  images: ProductImage[];
  title: string;
}

const SWIPE_THRESHOLD_PX = 40;

function GalleryArt({
  image,
  title,
  decorative,
  large,
  eager,
}: {
  image: ProductImage;
  title: string;
  decorative: boolean;
  large?: boolean;
  eager?: boolean;
}) {
  if (image.url) {
    // Real CDN imagery lands with the API; until then every product
    // carries deterministic flat placeholders (see data/products.ts).
    const view = (
      <ProductImageView
        image={image}
        title={image.alt || title}
        sizes={
          large
            ? "100vw"
            : decorative
              ? "96px"
              : "(max-width: 900px) 100vw, 50vw"
        }
        priority={eager}
        decorative={decorative}
        className={large ? styles.artImageLarge : styles.artImage}
      />
    );
    if (large) {
      return <span className={styles.artLargeFrame}>{view}</span>;
    }
    return view;
  }
  const hue = image.placeholder?.hue ?? 150;
  return (
    <span
      className={large ? styles.artLarge : styles.art}
      style={{ "--ch-art-hue": hue } as CSSProperties}
      aria-hidden="true"
    >
      <span className={large ? styles.monogramLarge : styles.monogram}>
        {image.placeholder?.label ?? "CH"}
      </span>
    </span>
  );
}

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchX = useRef<number | null>(null);
  const stageRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const move = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  const onTouchStart = useCallback((event: TouchEvent) => {
    touchX.current = event.touches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      const start = touchX.current;
      touchX.current = null;
      const end = event.changedTouches[0]?.clientX;
      if (start === null || start === undefined || end === undefined) return;
      const dx = end - start;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      move(dx < 0 ? 1 : -1);
    },
    [move],
  );

  const onArrowKeys = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
    },
    [move],
  );

  // Lightbox: Escape closes, arrows browse, focus is trapped on the dialog
  // and restored to the stage button; the page behind stops scrolling.
  useEffect(() => {
    if (!lightbox) return;
    const opener = stageRef.current;
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false);
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [lightbox, move]);

  if (count === 0) return null;
  const current = images[index] ?? images[0];
  if (!current) return null;

  return (
    <div className={styles.gallery}>
      <div
        className={styles.main}
        role="region"
        tabIndex={0}
        aria-label={`${title} gallery. Use left and right arrow keys to browse previews.`}
        onKeyDown={onArrowKeys}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          ref={stageRef}
          type="button"
          className={styles.stage}
          style={
            current.width && current.height
              ? { aspectRatio: `${current.width} / ${current.height}` }
              : undefined
          }
          onClick={() => setLightbox(true)}
          aria-haspopup="dialog"
          aria-label={`Enlarge preview ${index + 1} of ${count}`}
        >
          <GalleryArt
            image={current}
            title={title}
            decorative={false}
            eager={index === 0}
          />
        </button>
        {count > 1 && (
          <>
            <button
              type="button"
              className={cn(styles.nav, styles.prev)}
              onClick={() => move(-1)}
              aria-label="Previous preview"
            >
              <Icon name="chevron-left" size={20} />
            </button>
            <button
              type="button"
              className={cn(styles.nav, styles.next)}
              onClick={() => move(1)}
              aria-label="Next preview"
            >
              <Icon name="chevron-right" size={20} />
            </button>
          </>
        )}
        <p className={styles.counter} aria-hidden="true">
          {index + 1} / {count}
        </p>
        <span className={styles.expandHint} aria-hidden="true">
          <Icon name="expand" size={16} />
        </span>
      </div>
      <p role="status" className="ch-visually-hidden">
        Showing preview {index + 1} of {count}
      </p>

      {count > 1 && (
        <ul className={styles.thumbs} aria-label="Product previews">
          {images.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-label={`Show preview ${position + 1}`}
                aria-current={position === index}
                className={cn(
                  styles.thumb,
                  position === index && styles.thumbActive,
                )}
              >
                <GalleryArt image={image} title={title} decorative />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lightbox && (
        <div
          ref={dialogRef}
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} preview ${index + 1} of ${count}`}
          tabIndex={-1}
          onClick={() => setLightbox(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <figure
            className={styles.lightboxFigure}
            onClick={(event) => event.stopPropagation()}
          >
            <GalleryArt
              image={current}
              title={current.alt ?? title}
              decorative={false}
              large
            />
            <figcaption className="ch-visually-hidden">
              {current.alt ?? title}
            </figcaption>
            <div className={styles.lightboxBar}>
              <p aria-hidden="true">
                {index + 1} / {count}
              </p>
              {count > 1 && (
                <div className={styles.lightboxNav}>
                  <button
                    type="button"
                    className={styles.lightboxButton}
                    onClick={() => move(-1)}
                    aria-label="Previous preview"
                  >
                    <Icon name="chevron-left" size={20} />
                  </button>
                  <button
                    type="button"
                    className={styles.lightboxButton}
                    onClick={() => move(1)}
                    aria-label="Next preview"
                  >
                    <Icon name="chevron-right" size={20} />
                  </button>
                </div>
              )}
              <button
                type="button"
                className={styles.lightboxButton}
                onClick={() => setLightbox(false)}
                aria-label="Close preview"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          </figure>
        </div>
      )}
    </div>
  );
}
