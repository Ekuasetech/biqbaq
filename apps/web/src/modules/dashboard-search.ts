import type { SupabaseClient } from "@supabase/supabase-js";

// The dashboard's top-bar search (Q-56). The database decides what each person can find.

export const SEARCH_KINDS = ["conversation", "product", "vehicle", "client", "invoice", "biqbaq_client", "biqbaq_invoice", "person", "shop"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  detail: string | null;
}

export const MIN_QUERY = 2;

export const searchMyThings = (supabase: SupabaseClient, query: string) => supabase.rpc("search_my_things", { p_query: query });

/** Where a result leads: the page holding it, scrolled to it. */
export function resultHref(result: Pick<SearchResult, "kind" | "id">): string {
  const id = encodeURIComponent(result.id);
  switch (result.kind) {
    case "conversation":
      return `/account/messages?c=${id}`;
    case "product":
      return `/account/shop/products#product-${id}`;
    case "vehicle":
      return `/account/shop/cargo-cars#vehicle-${id}`;
    case "client":
      return `/account/shop/clients#client-${id}`;
    case "invoice":
      return `/account/shop/invoices#invoice-${id}`;
    case "biqbaq_client":
      return `/admin/email-lists#client-${id}`;
    case "biqbaq_invoice":
      return `/admin/email-lists#invoice-${id}`;
    case "person":
      return `/admin/people?q=${id}`;
    case "shop":
      return `/sellers/${id}`;
  }
}

/** Results grouped by kind, in a steady order. */
export function groupResults(results: SearchResult[]): { kind: SearchKind; items: SearchResult[] }[] {
  return SEARCH_KINDS.map((kind) => ({ kind, items: results.filter((result) => result.kind === kind) })).filter((group) => group.items.length > 0);
}
