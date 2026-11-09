import { describe, expect, it } from "vitest";
import { addressLines, orderState, paymentErrorKey } from "./index";

describe("orderState", () => {
  const paid = { status: "paid", refunded_minor: 0, subtotal_minor: 1000, fulfilled_at: null, disputed: false };
  it("follows an order from payment to delivery or refund", () => {
    expect(orderState(paid)).toBe("to_deliver");
    expect(orderState({ ...paid, fulfilled_at: "2026-11-08" })).toBe("delivered");
    expect(orderState({ ...paid, refunded_minor: 300 })).toBe("partly_refunded");
    expect(orderState({ ...paid, refunded_minor: 1000 })).toBe("refunded");
    // The buyer's service fee is never refunded, so refunding the sale is a full refund.
    expect(orderState({ ...paid, refunded_minor: 1000, total_minor: 1100 } as typeof paid)).toBe("refunded");
    expect(orderState({ ...paid, disputed: true })).toBe("disputed");
    expect(orderState({ ...paid, status: "pending" })).toBe("pending");
  });
});

describe("addressLines", () => {
  it("lays out a delivery address, leaving out what is missing", () => {
    expect(addressLines({ line1: "12 King St W", line2: null, city: "Toronto", state: "ON", postal_code: "M5H 1A1", country: "CA" })).toEqual([
      "12 King St W",
      "Toronto ON M5H 1A1",
      "CA",
    ]);
    expect(addressLines(null)).toEqual([]);
  });
});

describe("paymentErrorKey", () => {
  it("shows only known reasons", () => {
    expect(paymentErrorKey("OUT_OF_STOCK")).toBe("OUT_OF_STOCK");
    expect(paymentErrorKey("card_declined")).toBe("GENERIC");
    expect(paymentErrorKey(undefined)).toBe("GENERIC");
  });
});
