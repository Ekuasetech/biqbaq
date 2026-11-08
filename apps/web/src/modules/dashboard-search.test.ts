import { describe, expect, it } from "vitest";
import { groupResults, resultHref, type SearchResult } from "./dashboard-search";

describe("dashboard search", () => {
  it("leads each kind of result to the page holding it", () => {
    expect(resultHref({ kind: "product", id: "p1" })).toBe("/account/shop/products#product-p1");
    expect(resultHref({ kind: "client", id: "ada@example.com" })).toBe("/account/shop/clients#client-ada%40example.com");
    expect(resultHref({ kind: "conversation", id: "c1" })).toBe("/account/messages?c=c1");
    expect(resultHref({ kind: "person", id: "a b@example.com" })).toBe("/admin/people?q=a%20b%40example.com");
    expect(resultHref({ kind: "shop", id: "adire-studio" })).toBe("/sellers/adire-studio");
    expect(resultHref({ kind: "biqbaq_invoice", id: "i1" })).toBe("/admin/email-lists#invoice-i1");
  });

  it("groups results by kind, in a steady order", () => {
    const results: SearchResult[] = [
      { kind: "shop", id: "s", title: "S", detail: null },
      { kind: "product", id: "p", title: "P", detail: null },
      { kind: "conversation", id: "c", title: "C", detail: null },
    ];
    expect(groupResults(results).map((group) => group.kind)).toEqual(["conversation", "product", "shop"]);
  });
});
