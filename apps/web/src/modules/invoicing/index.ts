import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Invoices and receipts (Q-48 to Q-52). The database checks everything and works out the
// totals itself; this does the same arithmetic, the same way, so the page and the PDF
// preview show exactly what will be stored. Amounts are in cents, in CAD (ADR-0005).

export const MAX_ITEMS = 50;
export const MAX_TAXES = 3;

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price_minor: number;
}

export interface TaxLine {
  label: string;
  /** Thousandths of a percent, so Quebec's 9.975% is 9975. */
  rate_milli: number;
}

/** Quantity in hundredths, then cents, so no floating-point drift; halves round up, as the database does. */
export const lineAmount = (quantity: number, unitPriceMinor: number) =>
  Math.round((Math.round(quantity * 100) * unitPriceMinor) / 100);

export function invoiceTotals(items: InvoiceItem[], taxes: TaxLine[]) {
  const lines = items.map((item) => lineAmount(item.quantity, item.unit_price_minor));
  const subtotal = lines.reduce((sum, amount) => sum + amount, 0);
  const taxAmounts = taxes.map((tax) => Math.round((subtotal * tax.rate_milli) / 100000));
  const tax = taxAmounts.reduce((sum, amount) => sum + amount, 0);
  return { lines, subtotal, taxAmounts, tax, total: subtotal + tax };
}

/** "12.99" or "12,99" to 1299 cents; null if it isn't an amount. */
export function parseMoney(value: string): number | null {
  const clean = value.trim().replace(/\s/g, "").replace(/^\$|\$$/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** "2.5" or "2,5" to 2.5, up to two decimals; null if it isn't a quantity. */
export function parseQuantity(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  const quantity = Number(clean);
  return quantity > 0 && quantity <= 100000 ? quantity : null;
}

/** "13" or "9,975" (percent) to thousandths of a percent; null if it isn't a rate from 0 to 30. */
export function parseRate(value: string): number | null {
  const clean = value.trim().replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(clean)) return null;
  const milli = Math.round(Number(clean) * 1000);
  return milli <= 30000 ? milli : null;
}

export const formatMoney = (minor: number, locale: string) =>
  new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" }).format(minor / 100);

export const formatRate = (milli: number, locale: string) =>
  new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "percent", maximumFractionDigits: 3 }).format(milli / 100000);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the form sends, for the preview and for sending. The database applies the same rules. */
export const invoiceSchema = z
  .object({
    seller: z.uuid().nullable(),
    kind: z.enum(["invoice", "receipt"]),
    clientEmail: z.email().max(254),
    issueDate: isoDate,
    dueDate: isoDate.nullable(),
    paidDate: isoDate.nullable(),
    paymentMethod: z.string().trim().max(40).nullable(),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(200),
          quantity: z.number().positive().max(100000).refine((q) => Number.isInteger(Math.round(q * 100)) && Math.abs(q * 100 - Math.round(q * 100)) < 1e-9),
          unit_price_minor: z.number().int().min(0).max(100000000),
        }),
      )
      .min(1)
      .max(MAX_ITEMS),
    taxes: z.array(z.object({ label: z.string().trim().min(1).max(40), rate_milli: z.number().int().min(0).max(30000) })).max(MAX_TAXES),
    taxNumber: z.string().trim().max(30).nullable(),
    notes: z.string().trim().max(1000).nullable(),
  })
  .refine((value) => value.kind !== "invoice" || !value.dueDate || value.dueDate >= value.issueDate, { path: ["dueDate"] })
  .refine((value) => value.kind !== "receipt" || Boolean(value.paidDate), { path: ["paidDate"] });
export type InvoiceInput = z.infer<typeof invoiceSchema>;

/** A stored invoice, as the database hands it back. */
export interface StoredInvoice {
  id: string;
  kind: "invoice" | "receipt";
  label: string;
  client_email: string;
  client_name: string;
  client_phone: string | null;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  payment_method: string | null;
  items: (InvoiceItem & { amount_minor: number })[];
  taxes: (TaxLine & { amount_minor: number })[];
  tax_number: string | null;
  notes: string | null;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  sender_name: string;
  sender_address: string;
}

/** The same shape, for a preview of what has not been sent, numbered as a draft. */
export function previewInvoice(input: InvoiceInput, client: { name: string; phone: string | null }, sender: { name: string; address: string }, draftLabel: string): StoredInvoice {
  const totals = invoiceTotals(input.items, input.taxes);
  return {
    id: "preview",
    kind: input.kind,
    label: draftLabel,
    client_email: input.clientEmail.toLowerCase(),
    client_name: client.name,
    client_phone: client.phone,
    issue_date: input.issueDate,
    due_date: input.kind === "invoice" ? input.dueDate : null,
    paid_date: input.kind === "receipt" ? input.paidDate : null,
    payment_method: input.kind === "receipt" ? input.paymentMethod || null : null,
    items: input.items.map((item, index) => ({ ...item, description: item.description.trim(), amount_minor: totals.lines[index] })),
    taxes: input.taxes.map((tax, index) => ({ ...tax, label: tax.label.trim(), amount_minor: totals.taxAmounts[index] })),
    tax_number: input.taxNumber || null,
    notes: input.notes || null,
    subtotal_minor: totals.subtotal,
    tax_minor: totals.tax,
    total_minor: totals.total,
    sender_name: sender.name,
    sender_address: sender.address,
  };
}

export interface InvoiceSummary {
  id: string;
  kind: "invoice" | "receipt";
  label: string;
  client_name: string;
  client_email: string;
  total_minor: number;
  issue_date: string;
  created_at: string;
  send_count: number;
}

export const createInvoice = (supabase: SupabaseClient, input: InvoiceInput) =>
  supabase.rpc("create_invoice", {
    p_seller: input.seller,
    p_kind: input.kind,
    p_client_email: input.clientEmail,
    p_issue_date: input.issueDate,
    p_due_date: input.kind === "invoice" ? input.dueDate : null,
    p_paid_date: input.kind === "receipt" ? input.paidDate : null,
    p_payment_method: input.kind === "receipt" ? input.paymentMethod : null,
    p_items: input.items,
    p_taxes: input.taxes,
    p_tax_number: input.taxNumber,
    p_notes: input.notes,
  });
export const listInvoices = (supabase: SupabaseClient, seller: string | null) => supabase.rpc("list_invoices", { p_seller: seller });
export const resendInvoice = (supabase: SupabaseClient, seller: string | null, id: string) =>
  supabase.rpc("resend_invoice", { p_seller: seller, p_id: id });

export function invoiceErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    BULK_EMAIL_DISABLED: "disabled",
    ADDRESS_REQUIRED: "addressRequired",
    EMAIL_OFF: "emailOff",
    CLIENT_NOT_FOUND: "clientNotFound",
    DETAILS_INVALID: "detailsInvalid",
    ITEMS_INVALID: "itemsInvalid",
    TAXES_INVALID: "taxesInvalid",
    INVOICE_LIMIT: "invoiceLimit",
    RESEND_LIMIT: "resendLimit",
    INVOICE_NOT_FOUND: "notFound",
  };
  if (error.message && known[error.message]) return known[error.message];
  return error.code === "42501" ? "notAllowed" : "generic";
}
