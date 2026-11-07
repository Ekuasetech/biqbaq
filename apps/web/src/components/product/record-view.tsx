"use client";

import { useEffect } from "react";

/** Reports one view when the page is seen. The server decides whether it counts. */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    void fetch(`/api/v1/products/${productId}/view`, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [productId]);
  return null;
}
