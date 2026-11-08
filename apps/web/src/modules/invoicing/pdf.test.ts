import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { StoredInvoice } from "./index";
import { makeSafeText, renderInvoicePdf } from "./pdf";

const invoice: StoredInvoice = {
  id: "1",
  kind: "invoice",
  label: "INV-0001",
  client_email: "chidi@example.com",
  client_name: "Ọlá Adébáyọ̀",
  client_phone: "416-555-0199",
  issue_date: "2026-11-08",
  due_date: "2026-11-22",
  paid_date: null,
  payment_method: null,
  items: Array.from({ length: 60 }, (_, i) => ({ description: `Ankara fabric, yard ${i + 1}, with a long description that wraps onto another line`, quantity: 2.5, unit_price_minor: 1299, amount_minor: 3248 })),
  taxes: [{ label: "HST", rate_milli: 13000, amount_minor: 552 }],
  tax_number: "123456789 RT0001",
  notes: "Thank you!\nPay by e-transfer.",
  subtotal_minor: 4248,
  tax_minor: 552,
  total_minor: 4800,
  sender_name: "Adire Studio",
  sender_address: "12 King St W, Toronto ON M5H 1A1",
};

describe("invoice PDF", () => {
  it("makes a valid PDF, over several pages when there are many items", async () => {
    const bytes = await renderInvoicePdf(invoice);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("INVOICE INV-0001");
  });

  it("works in French, for receipts", async () => {
    const doc = await PDFDocument.load(await renderInvoicePdf({ ...invoice, kind: "receipt", label: "RCT-0001", paid_date: "2026-11-08", payment_method: "Virement", items: invoice.items.slice(0, 2) }, { locale: "fr" }));
    expect(doc.getTitle()).toBe("REÇU RCT-0001");
    expect(doc.getPageCount()).toBe(1);
  });

  it("never fails on letters the font lacks", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const safe = makeSafeText(font);
    expect(safe("Ọlá Adébáyọ̀")).toBe("Olá Adébáyo");
    expect(safe("Café 中")).toBe("Café ?");
    expect(safe("48,00 $")).toBe("48,00 $");
  });
});
