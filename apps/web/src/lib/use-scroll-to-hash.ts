"use client";

import { useEffect } from "react";

/**
 * Scrolls to the item named in the address (#product-…), once the list holding it has
 * loaded, and highlights it briefly. Used by the dashboard search's results (Q-56).
 */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      let target: HTMLElement | null = null;
      try {
        target = document.getElementById(decodeURIComponent(hash));
      } catch {
        return;
      }
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ring-2", "ring-brand-red", "ring-offset-2");
      setTimeout(() => target?.classList.remove("ring-2", "ring-brand-red", "ring-offset-2"), 2500);
    }, 50);
    return () => clearTimeout(timer);
  }, [ready]);
}
