import { ViewTransition, type ReactNode } from "react";

/**
 * Animates a page in and out during navigation. It wraps each page rather than
 * the layout, because layouts persist across navigations and would never animate.
 * Browsers without view transitions simply change page as normal.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Gives a photo an identity across pages, so a card's photo morphs into the large
 * photo on the next page. A name must appear only once on a page.
 */
export function SharedPhoto({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

export const productPhotoName = (slug: string) => `product-photo-${slug}`;
export const carPhotoName = (slug: string) => `car-photo-${slug}`;
