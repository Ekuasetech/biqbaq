"use client";

import { useEffect } from "react";

const SELECTOR = "[data-rv]:not([data-rv-shown])";

/** Plays each [data-rv] element's reveal once, when it scrolls into view. */
export function RevealObserver() {
  useEffect(() => {
    (window as Window & { __rvReady?: boolean }).__rvReady = true;

    const show = (element: Element) => element.setAttribute("data-rv-shown", "");

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(SELECTOR).forEach(show);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );

    const observeAll = () => document.querySelectorAll(SELECTOR).forEach((el) => observer.observe(el));
    observeAll();

    // Picks up content that streams in or arrives on client navigation.
    const mutations = new MutationObserver(observeAll);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}

/**
 * Runs before first paint, so elements start hidden instead of flashing. If the
 * observer has not started after 4 seconds, it un-hides everything.
 */
export const REVEAL_BOOT_SCRIPT =
  "document.documentElement.classList.add('rv');setTimeout(function(){if(!window.__rvReady)document.documentElement.classList.remove('rv')},4000)";
