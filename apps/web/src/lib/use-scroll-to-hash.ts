"use client";

import { useCallback, useEffect, useRef } from "react";

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

/** Whether the item named by `hash` is not on this page but could be on a later one. */
export function itemMayBeLater(hash: string, prefix: string, ids: string[], page: number, pageSize: number, total: number) {
  return hash.startsWith(prefix) && hash.length > prefix.length && !ids.includes(hash.slice(prefix.length)) && page * pageSize < total && page < 50;
}

/**
 * For a list shown a page at a time: whether the item named in the address (#product-…)
 * may be on a later page, so the list should move on to look for it. It stops looking once
 * the item is found, the pages run out, or after 50 pages, so the person's own paging is
 * never taken over.
 */
export function useSeekHash(prefix: string) {
  const seeking = useRef(true);
  return useCallback(
    (ids: string[], page: number, pageSize: number, total: number) => {
      if (!seeking.current) return false;
      let hash = "";
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        // A malformed address names nothing.
      }
      if (!itemMayBeLater(hash, prefix, ids, page, pageSize, total)) {
        seeking.current = false;
        return false;
      }
      return true;
    },
    [prefix],
  );
}
