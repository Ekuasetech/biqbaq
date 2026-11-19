import { useEffect, useRef } from "react";

/** How long typing must pause before a search runs, so each key press is not its own request. */
export const LIVE_SEARCH_DELAY_MS = 300;

/**
 * Searches as people type (owner's request, 2026-11-18): once typing pauses, `onSearch`
 * receives the trimmed text, but only when it differs from the last search. Returns a
 * function for the Search button and Enter, which search at once.
 */
export function useLiveSearch(typed: string, onSearch: (search: string) => void, delay = LIVE_SEARCH_DELAY_MS) {
  const latest = useRef(onSearch);
  const sent = useRef(typed.trim());

  useEffect(() => {
    latest.current = onSearch;
  });

  useEffect(() => {
    const next = typed.trim();
    if (next === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = next;
      latest.current(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [typed, delay]);

  return (search: string) => {
    sent.current = search.trim();
    latest.current(sent.current);
  };
}
