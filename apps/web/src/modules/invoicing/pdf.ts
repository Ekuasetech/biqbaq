import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, formatRate, type StoredInvoice } from "./index";

// Makes the invoice or receipt PDF on Biqbaq's own server: nothing is sent to another service.
// The built-in fonts cover English and French; any other letter is shown without its accent
// (for example Ọ as O), or as "?" if it has no plain form.

type Locale = "en" | "fr";

const LABELS = {
  en: {
    invoice: "INVOICE",
    receipt: "RECEIPT",
    number: "Number",
    issued: "Date",
    due: "Due",
    paid: "Paid",
    method: "Payment method",
    billTo: "Bill to",
    receivedFrom: "Received from",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    total: "Total (CAD)",
    totalPaid: "Total paid (CAD)",
    taxNumber: "GST/HST number",
    notes: "Notes",
    footer: "Sent through Biqbaq",
    draft: "PREVIEW: NOT SENT",
  },
  fr: {
    invoice: "FACTURE",
    receipt: "REÇU",
    number: "Numéro",
    issued: "Date",
    due: "Échéance",
    paid: "Payé le",
    method: "Mode de paiement",
    billTo: "Facturé à",
    receivedFrom: "Reçu de",
    description: "Description",
    quantity: "Qté",
    unitPrice: "Prix unitaire",
    amount: "Montant",
    subtotal: "Sous-total",
    total: "Total (CAD)",
    totalPaid: "Total payé (CAD)",
    taxNumber: "Numéro de TPS/TVH",
    notes: "Notes",
    footer: "Envoyé par Biqbaq",
    draft: "APERÇU : NON ENVOYÉ",
  },
};

const PAGE = { width: 595.28, height: 841.89, margin: 50 };
const INK = rgb(0.1, 0.12, 0.2);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.85, 0.86, 0.89);

/** Keeps only what the font can draw, so a client's name can never stop a PDF being made. */
export function makeSafeText(font: PDFFont) {
  const cache = new Map<string, string>();
  const drawable = (char: string) => {
    try {
      font.encodeText(char);
      return true;
    } catch {
      return false;
    }
  };
  return (value: string) =>
    [...value.normalize("NFC").replace(/[\u202f\u00a0\u2009]/g, " ").replace(/[\r\t]/g, " ")]
      .map((char) => {
        if (char === "\n") return char;
        let safe = cache.get(char);
        if (safe === undefined) {
          const plain = char.normalize("NFD").replace(/\p{M}/gu, "");
          // A separate accent mark the font cannot draw is simply left off.
          safe = drawable(char) ? char : /^\p{M}$/u.test(char) ? "" : plain && [...plain].every(drawable) ? plain : "?";
          cache.set(char, safe);
        }
        return safe;
      })
      .join("");
}

/** Splits text into lines that fit a width. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word longer than the line is broken where it must be.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const formatDate = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const quantityText = (quantity: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(quantity);

export async function renderInvoicePdf(invoice: StoredInvoice, options: { locale?: string; preview?: boolean } = {}): Promise<Uint8Array> {
  const locale: Locale = options.locale === "fr" ? "fr" : "en";
  const L = LABELS[locale];
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafeText(regular);
  const title = invoice.kind === "invoice" ? L.invoice : L.receipt;
  pdf.setTitle(`${title} ${invoice.label}`);
  pdf.setAuthor(safe(invoice.sender_name));
  pdf.setProducer("Biqbaq");
  pdf.setCreator("Biqbaq");

  const contentWidth = PAGE.width - PAGE.margin * 2;
  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const text = (value: string, x: number, at: number, size = 10, font = regular, color = INK) =>
    page.drawText(safe(value), { x, y: at, size, font, color });
  const right = (value: string, edge: number, at: number, size = 10, font = regular, color = INK) => {
    const clean = safe(value);
    page.drawText(clean, { x: edge - font.widthOfTextAtSize(clean, size), y: at, size, font, color });
  };
  const newPageIfNeeded = (needed: number) => {
    if (y - needed < PAGE.margin + 30) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };

  if (options.preview) {
    right(L.draft, PAGE.width - PAGE.margin, PAGE.height - 28, 9, bold, rgb(0.75, 0.1, 0.1));
  }

  // The sender, and the document's own details.
  const senderTop = y;
  text(invoice.sender_name, PAGE.margin, y, 16, bold);
  y -= 18;
  for (const line of wrap(safe(invoice.sender_address), regular, 9, contentWidth / 2 - 10)) {
    text(line, PAGE.margin, y, 9, regular, MUTED);
    y -= 12;
  }
  if (invoice.tax_number) {
    text(`${L.taxNumber}: ${invoice.tax_number}`, PAGE.margin, y, 9, regular, MUTED);
    y -= 12;
  }

  let ry = senderTop;
  const edge = PAGE.width - PAGE.margin;
  right(title, edge, ry, 20, bold);
  ry -= 22;
  const detail = (label: string, value: string) => {
    right(`${label}: ${value}`, edge, ry, 9, regular, MUTED);
    ry -= 12;
  };
  detail(L.number, invoice.label);
  detail(L.issued, formatDate(invoice.issue_date, locale));
  if (invoice.kind === "invoice" && invoice.due_date) detail(L.due, formatDate(invoice.due_date, locale));
  if (invoice.kind === "receipt" && invoice.paid_date) detail(L.paid, formatDate(invoice.paid_date, locale));
  if (invoice.kind === "receipt" && invoice.payment_method) detail(L.method, invoice.payment_method);
  y = Math.min(y, ry) - 18;

  // The client.
  text(invoice.kind === "invoice" ? L.billTo : L.receivedFrom, PAGE.margin, y, 9, bold, MUTED);
  y -= 14;
  for (const line of [invoice.client_name, invoice.client_email, invoice.client_phone].filter(Boolean) as string[]) {
    text(line, PAGE.margin, y, 10);
    y -= 13;
  }
  y -= 14;

  // The items.
  const columns = { quantity: PAGE.margin + contentWidth * 0.62, unit: PAGE.margin + contentWidth * 0.8, amount: edge };
  const descriptionWidth = contentWidth * 0.55;
  const header = () => {
    text(L.description, PAGE.margin, y, 9, bold, MUTED);
    right(L.quantity, columns.quantity, y, 9, bold, MUTED);
    right(L.unitPrice, columns.unit, y, 9, bold, MUTED);
    right(L.amount, columns.amount, y, 9, bold, MUTED);
    y -= 6;
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: edge, y }, thickness: 0.8, color: LINE });
    y -= 14;
  };
  header();
  for (const item of invoice.items) {
    const lines = wrap(safe(item.description), regular, 10, descriptionWidth);
    if (y - lines.length * 13 < PAGE.margin + 30) {
      newPageIfNeeded(Number.POSITIVE_INFINITY);
      header();
    }
    right(quantityText(item.quantity, locale), columns.quantity, y);
    right(formatMoney(item.unit_price_minor, locale), columns.unit, y);
    right(formatMoney(item.amount_minor, locale), columns.amount, y);
    for (const line of lines) {
      text(line, PAGE.margin, y);
      y -= 13;
    }
    y -= 4;
  }
  page.drawLine({ start: { x: PAGE.margin, y: y + 6 }, end: { x: edge, y: y + 6 }, thickness: 0.8, color: LINE });
  y -= 10;

  // Totals.
  newPageIfNeeded(40 + invoice.taxes.length * 14);
  const totalLine = (label: string, value: string, strong = false) => {
    right(label, columns.unit, y, strong ? 11 : 10, strong ? bold : regular, strong ? INK : MUTED);
    right(value, columns.amount, y, strong ? 11 : 10, strong ? bold : regular);
    y -= strong ? 18 : 14;
  };
  totalLine(L.subtotal, formatMoney(invoice.subtotal_minor, locale));
  for (const tax of invoice.taxes) totalLine(`${tax.label} (${formatRate(tax.rate_milli, locale)})`, formatMoney(tax.amount_minor, locale));
  y -= 2;
  totalLine(invoice.kind === "invoice" ? L.total : L.totalPaid, formatMoney(invoice.total_minor, locale), true);

  if (invoice.notes) {
    y -= 10;
    newPageIfNeeded(40);
    text(L.notes, PAGE.margin, y, 9, bold, MUTED);
    y -= 13;
    for (const line of wrap(safe(invoice.notes), regular, 10, contentWidth)) {
      newPageIfNeeded(13);
      text(line, PAGE.margin, y);
      y -= 13;
    }
  }

  for (const each of pdf.getPages()) {
    page = each;
    text(L.footer, PAGE.margin, PAGE.margin - 20, 8, regular, MUTED);
  }
  return pdf.save();
}

export const invoiceFileName = (invoice: Pick<StoredInvoice, "label">) => `${invoice.label}.pdf`;
