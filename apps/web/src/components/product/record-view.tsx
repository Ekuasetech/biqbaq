"use client";

import { useEffect } from "react";

/** Reports one view or read when the page is seen. The server decides whether it counts. */
export function RecordView({ path }: { path: string }) {
  useEffect(() => {
    void fetch(path, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [path]);
  return null;
}
