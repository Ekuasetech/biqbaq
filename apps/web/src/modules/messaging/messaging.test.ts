import { describe, expect, it } from "vitest";
import { inReadingOrder, listingPath, messageSchema, messagingErrorKey, type Message } from "./index";

describe("messageSchema", () => {
  it("trims, and needs some text within the limit", () => {
    expect(messageSchema.parse("  Hello  ")).toBe("Hello");
    expect(messageSchema.safeParse("   ").error?.issues[0]?.message).toBe("required");
    expect(messageSchema.safeParse("x".repeat(2001)).error?.issues[0]?.message).toBe("tooLong");
  });
});

describe("listingPath", () => {
  it("links products and cargo cars to their own pages", () => {
    expect(listingPath({ listing_type: "product", listing_slug: "suya" })).toBe("/products/suya");
    expect(listingPath({ listing_type: "vehicle", listing_slug: "2021-toyota-sienna" })).toBe("/cargo-cars/2021-toyota-sienna");
    expect(listingPath({ listing_type: null, listing_slug: null })).toBeNull();
  });
});

describe("inReadingOrder", () => {
  const message = (id: string, at: string): Message => ({ id, sender_side: "buyer", sender_name: "", from_me: true, body: id, created_at: at });
  it("puts pages of newest-first messages oldest first", () => {
    const latest = [message("c", "2026-11-08T10:03:00Z"), message("b", "2026-11-08T10:02:00Z")];
    const earlier = [message("a", "2026-11-08T10:01:00Z")];
    expect(inReadingOrder([latest, earlier]).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("messagingErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(messagingErrorKey({ code: "55000", message: "CONVERSATION_CLOSED" })).toBe("closed");
    expect(messagingErrorKey({ code: "P0001", message: "RATE_LIMITED" })).toBe("rateLimited");
    expect(messagingErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(messagingErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});
