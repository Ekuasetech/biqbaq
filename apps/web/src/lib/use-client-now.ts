"use client";

import { useEffect, useState } from "react";

/**
 * The current time, read only in the browser after the page has loaded and refreshed each
 * minute, for times like "5 minutes ago". Null before then, so the server's page and the
 * browser's first render agree, and nothing is fixed at build time.
 */
export function useClientNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
