import { describe, expect, it } from "vitest";
import { formatMoney, formatRate, invoiceErrorKey, invoiceSchema, invoiceTotals, lineAmount, parseMoney, parseQuantity, parseRate } from "./index";

describe("invoice arithmetic", () => {
  it("matches the database: halves round up, and nothing drifts", () => {
    expect(lineAmount(2.5, 1299)).toBe(3248);
    expect(lineAmount(1.15, 100)).toBe(115);
    expect(lineAmount(0.1, 3)).toBe(0);
    const totals = invoiceTotals(
      [
        { description: "Fabric", quantity: 2.5, unit_price_minor: 1299 },
        { description: "Delivery", quantity: 1, unit_price_minor: 1000 },
      ],
      [{ label: "HST", rate_milli: 13000 }],
    );
    // The same example the database test checks.
    expect(totals).toMatchObject({ subtotal: 4248, tax: 552, total: 4800 });
  });

  it("adds several tax lines, each on the subtotal", () => {
    const totals = invoiceTotals([{ description: "x", quantity: 1, unit_price_minor: 10000 }], [
      { label: "GST", rate_milli: 5000 },
      { label: "QST", rate_milli: 9975 },
    ]);
    expect(totals.taxAmounts).toEqual([500, 998]); // 9.975% of $100 is $9.975, so $9.98
    expect(totals.total).toBe(11498);
  });
});

describe("reading what people type", () => {
  it("understands money in either language", () => {
    expect(parseMoney("12.99")).toBe(1299);
    expect(parseMoney("12,99")).toBe(1299);
    expect(parseMoney("$5")).toBe(500);
    expect(parseMoney("1.999")).toBeNull();
    expect(parseMoney("-3")).toBeNull();
    expect(parseMoney("lots")).toBeNull();
  });
  it("takes quantities up to two decimals", () => {
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1.555")).toBeNull();
  });
  it("takes tax rates from 0 to 30 percent", () => {
    expect(parseRate("13")).toBe(13000);
    expect(parseRate("9,975 %")).toBe(9975);
    expect(parseRate("9.9755")).toBeNull();
    expect(parseRate("31")).toBeNull();
  });
  it("shows rates as typed", () => {
    expect(formatRate(9975, "en")).toBe("9.975%");
    expect(formatRate(13000, "en")).toBe("13%");
  });
  it("shows Canadian dollars in each language", () => {
    expect(formatMoney(4800, "en")).toBe("$48.00");
    expect(formatMoney(4800, "fr").replace(/\s/g, " ")).toBe("48,00 $");
  });
});

describe("invoiceSchema", () => {
  const valid = {
    seller: null,
    kind: "receipt",
    clientEmail: "chidi@example.com",
    issueDate: "2026-11-08",
    dueDate: null,
    paidDate: "2026-11-08",
    paymentMethod: "Cash",
    items: [{ description: "Fabric", quantity: 2.5, unit_price_minor: 1299 }],
    taxes: [],
    taxNumber: null,
    notes: null,
  };
  it("accepts a complete receipt, and refuses one without a paid date", () => {
    expect(invoiceSchema.safeParse(valid).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...valid, paidDate: null }).success).toBe(false);
  });
  it("refuses an invoice due before it was issued", () => {
    expect(invoiceSchema.safeParse({ ...valid, kind: "invoice", dueDate: "2026-11-01" }).success).toBe(false);
  });
  it("maps refusals to messages", () => {
    expect(invoiceErrorKey({ code: "P0001", message: "INVOICE_LIMIT" })).toBe("invoiceLimit");
    expect(invoiceErrorKey({ code: "XX000", message: "x" })).toBe("generic");
  });
});
