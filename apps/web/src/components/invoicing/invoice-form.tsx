"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getList, type EmailList, type Subscriber } from "@/modules/email-lists";
import {
  createInvoice,
  formatMoney,
  formatRate,
  invoiceErrorKey,
  invoiceSchema,
  invoiceTotals,
  lineAmount,
  MAX_ITEMS,
  MAX_TAXES,
  parseMoney,
  parseQuantity,
  parseRate,
  type InvoiceInput,
} from "@/modules/invoicing";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ItemRow {
  key: number;
  description: string;
  quantity: string;
  price: string;
}
interface TaxRow {
  key: number;
  label: string;
  rate: string;
}

/** Today in Toronto, as the database counts days. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

/**
 * Writing an invoice or receipt for one of the shop's clients (or Biqbaq's), previewing it
 * as a PDF, and sending it (Q-50 to Q-52). The database checks and totals it again.
 */
export function InvoiceForm() {
  const t = useTranslations("invoices");
  const locale = useLocale();
  const params = useSearchParams();
  const rawSeller = params.get("seller");
  const seller = rawSeller && UUID.test(rawSeller) ? rawSeller : null;
  const back = seller ? "/account/shop" : "/admin/email-lists";

  const [list, setList] = useState<EmailList | null | undefined>(undefined);
  const [clients, setClients] = useState<Subscriber[]>([]);
  const [kind, setKind] = useState<"invoice" | "receipt">("invoice");
  const [clientEmail, setClientEmail] = useState((params.get("client") ?? "").toLowerCase());
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState(today);
  const [method, setMethod] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ key: 1, description: "", quantity: "1", price: "" }]);
  const [taxes, setTaxes] = useState<TaxRow[]>([]);
  const [taxNumber, setTaxNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sent, setSent] = useState<{ label: string; total: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await getList(supabase, seller);
      const found = error ? null : ((data as EmailList[])[0] ?? null);
      setList(found);
      if (found?.enabled) {
        const { data: rows } = await supabase.rpc("list_subscribers_page", { p_seller: seller, p_limit: 200 });
        setClients(((rows ?? []) as Subscriber[]).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [seller]);

  // Cleans up the last preview when a new one is made or the page closes.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const parsedItems = items.map((row) => ({ description: row.description.trim(), quantity: parseQuantity(row.quantity), unit_price_minor: parseMoney(row.price) }));
  const parsedTaxes = taxes.map((row) => ({ label: row.label.trim(), rate_milli: parseRate(row.rate) }));
  // Worked out again as people type; lines not yet complete count as zero.
  const totals = invoiceTotals(
    parsedItems.map((item) => ({ description: item.description, quantity: item.quantity ?? 0, unit_price_minor: item.unit_price_minor ?? 0 })),
    parsedTaxes.map((tax) => ({ label: tax.label, rate_milli: tax.rate_milli ?? 0 })),
  );

  /** The form as the database expects it, or the first problem's message key. */
  function build(): InvoiceInput | string {
    if (!clientEmail) return "clientRequired";
    for (const [index, item] of parsedItems.entries()) {
      if (!item.description) return `itemDescription:${index + 1}`;
      if (item.quantity === null) return `itemQuantity:${index + 1}`;
      if (item.unit_price_minor === null) return `itemPrice:${index + 1}`;
    }
    for (const [index, tax] of parsedTaxes.entries()) {
      if (!tax.label) return `taxLabel:${index + 1}`;
      if (tax.rate_milli === null) return `taxRate:${index + 1}`;
    }
    const input = {
      seller,
      kind,
      clientEmail,
      issueDate,
      dueDate: kind === "invoice" && dueDate ? dueDate : null,
      paidDate: kind === "receipt" ? paidDate || null : null,
      paymentMethod: kind === "receipt" ? method.trim() || null : null,
      items: parsedItems as InvoiceInput["items"],
      taxes: parsedTaxes as InvoiceInput["taxes"],
      taxNumber: taxNumber.trim() || null,
      notes: notes.trim() || null,
    };
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) {
      const path = String(parsed.error.issues[0]?.path[0] ?? "");
      return path === "dueDate" ? "dueBeforeIssue" : path === "paidDate" ? "paidDateRequired" : "detailsInvalid";
    }
    return parsed.data;
  }

  const problemText = (key: string) => {
    const [name, row] = key.split(":");
    if (row) return t(`errors.${name}`, { row });
    return t.has(`errors.${name}`) ? t(`errors.${name}`) : t("errors.generic");
  };

  async function showPreview() {
    setSent(null);
    const input = build();
    if (typeof input === "string") return setFailure(input);
    setFailure(null);
    setWorking(true);
    const response = await fetch("/api/v1/invoices/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, locale }),
    }).catch(() => null);
    setWorking(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      return setFailure(body?.error === "CLIENT_NOT_FOUND" ? "clientNotFound" : body?.error === "ADDRESS_REQUIRED" ? "addressRequired" : "previewFailed");
    }
    setPreview(URL.createObjectURL(await response.blob()));
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    setSent(null);
    const input = build();
    if (typeof input === "string") return setFailure(input);
    setFailure(null);
    setWorking(true);
    const { data, error } = await createInvoice(getSupabaseBrowserClient(), input);
    setWorking(false);
    if (error) return setFailure(invoiceErrorKey(error));
    const row = (data as { label: string; total_minor: number }[])[0];
    setSent({ label: row.label, total: row.total_minor });
    setItems([{ key: nextKey, description: "", quantity: "1", price: "" }]);
    setNextKey(nextKey + 1);
    setNotes("");
    setPreview(null);
  }

  if (list === undefined) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (!list?.enabled) {
    return (
      <div className={cardClass}>
        <Notice kind="error">{t("errors.disabled")}</Notice>
        <Link href={back} className={cn(primaryButton, "mt-4")}>{t("back")}</Link>
      </div>
    );
  }

  const client = clients.find((row) => row.email === clientEmail);
  const cell = "block md:table-cell md:px-2 md:py-1.5 md:align-top";
  const input = "h-10 text-base md:text-sm";

  return (
    <form onSubmit={send} noValidate aria-label={t("formLabel")} className="grid gap-4">
      <Link href={back} className="text-sm text-muted-foreground underline underline-offset-4">{t("back")}</Link>
      {!list.mailing_address && <Notice kind="error">{t("errors.addressRequired")}</Notice>}

      <section aria-labelledby="invoice-details" className={cn(cardClass, "grid gap-4")}>
        <h2 id="invoice-details" className={headingClass}>{t("details")}</h2>
        <div role="radiogroup" aria-label={t("kindLabel")} className="flex flex-wrap gap-2">
          {(["invoice", "receipt"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={kind === name}
              onClick={() => setKind(name)}
              className={cn(secondaryButton, kind === name && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
            >
              {t(`kind.${name}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(`kindHelp.${kind}`)}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="invoice-client">{t("client")}</Label>
            <select
              id="invoice-client"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
              className="h-10 w-full min-w-0 max-w-full truncate rounded-lg border border-input bg-card px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            >
              <option value="">{t("chooseClient")}</option>
              {clients.map((row) => (
                <option key={row.email} value={row.email}>{row.name ? `${row.name} (${row.email})` : row.email}</option>
              ))}
            </select>
            {client?.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
            {clients.length === 0 && <p className="text-xs text-muted-foreground">{t("noClients")}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-issued">{t("issueDate")}</Label>
            <Input id="invoice-issued" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={input} />
          </div>
          {kind === "invoice" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="invoice-due">{t("dueDate")}</Label>
              <Input id="invoice-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={input} />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="invoice-paid">{t("paidDate")}</Label>
                <Input id="invoice-paid" type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} className={input} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="invoice-method">{t("paymentMethod")}</Label>
                <Input id="invoice-method" value={method} maxLength={40} placeholder={t("paymentMethodExample")} onChange={(event) => setMethod(event.target.value)} className={input} />
              </div>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="invoice-items" className={cn(cardClass, "grid gap-3")}>
        <h2 id="invoice-items" className={headingClass}>{t("items")}</h2>
        <table className="block w-full md:table md:border-collapse">
          <caption className="sr-only">{t("items")}</caption>
          <thead className="hidden md:table-header-group">
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="px-2 pb-1 font-semibold">{t("description")}</th>
              <th scope="col" className="w-24 px-2 pb-1 font-semibold">{t("quantity")}</th>
              <th scope="col" className="w-32 px-2 pb-1 font-semibold">{t("unitPrice")}</th>
              <th scope="col" className="w-28 px-2 pb-1 text-right font-semibold">{t("amount")}</th>
              <th scope="col" className="w-24 px-2 pb-1"><span className="sr-only">{t("actions")}</span></th>
            </tr>
          </thead>
          <tbody className="grid gap-3 md:table-row-group">
            {items.map((row, index) => {
              const label = (field: string) => t("fieldLabel", { field: t(field), row: index + 1 });
              const quantity = parseQuantity(row.quantity);
              const price = parseMoney(row.price);
              return (
                <tr key={row.key} className="grid gap-2 rounded-2xl bg-muted/40 p-3 md:table-row md:bg-transparent md:p-0">
                  <td className={cell}>
                    <Label htmlFor={`item-${row.key}-description`} className="mb-1 md:sr-only">{label("description")}</Label>
                    <Input id={`item-${row.key}-description`} value={row.description} maxLength={200} onChange={(event) => setItems(items.map((other) => (other.key === row.key ? { ...other, description: event.target.value } : other)))} className={input} />
                  </td>
                  <td className={cell}>
                    <Label htmlFor={`item-${row.key}-quantity`} className="mb-1 md:sr-only">{label("quantity")}</Label>
                    <Input id={`item-${row.key}-quantity`} inputMode="decimal" value={row.quantity} onChange={(event) => setItems(items.map((other) => (other.key === row.key ? { ...other, quantity: event.target.value } : other)))} className={input} />
                  </td>
                  <td className={cell}>
                    <Label htmlFor={`item-${row.key}-price`} className="mb-1 md:sr-only">{label("unitPrice")}</Label>
                    <Input id={`item-${row.key}-price`} inputMode="decimal" placeholder="0.00" value={row.price} onChange={(event) => setItems(items.map((other) => (other.key === row.key ? { ...other, price: event.target.value } : other)))} className={input} />
                  </td>
                  <td className={cn(cell, "text-sm md:text-right md:leading-10")}>
                    <span className="text-muted-foreground md:sr-only">{label("amount")}: </span>
                    <span className="font-semibold tabular-nums">{quantity !== null && price !== null ? formatMoney(lineAmount(quantity, price), locale) : "—"}</span>
                  </td>
                  <td className={cn(cell, "md:text-right")}>
                    {items.length > 1 && (
                      <button type="button" aria-label={t("removeItem", { row: index + 1 })} onClick={() => setItems(items.filter((other) => other.key !== row.key))} className={cn(secondaryButton, "md:h-10")}>
                        {t("remove")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length < MAX_ITEMS && (
          <button
            type="button"
            onClick={() => {
              setItems([...items, { key: nextKey, description: "", quantity: "1", price: "" }]);
              setNextKey(nextKey + 1);
            }}
            className={cn(secondaryButton, "w-fit")}
          >
            {t("addItem")}
          </button>
        )}
      </section>

      <section aria-labelledby="invoice-taxes" className={cn(cardClass, "grid gap-3")}>
        <h2 id="invoice-taxes" className={headingClass}>{t("taxes")}</h2>
        <p className="text-xs text-muted-foreground">{t("taxesHelp")}</p>
        {taxes.length > 0 && (
          <ul className="grid gap-2">
            {taxes.map((row, index) => (
              <li key={row.key} className="grid gap-2 rounded-2xl bg-muted/40 p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                <div className="grid gap-1">
                  <Label htmlFor={`tax-${row.key}-label`}>{t("fieldLabel", { field: t("taxName"), row: index + 1 })}</Label>
                  <Input id={`tax-${row.key}-label`} value={row.label} maxLength={40} placeholder="HST" onChange={(event) => setTaxes(taxes.map((other) => (other.key === row.key ? { ...other, label: event.target.value } : other)))} className={input} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`tax-${row.key}-rate`}>{t("fieldLabel", { field: t("taxRate"), row: index + 1 })}</Label>
                  <Input id={`tax-${row.key}-rate`} inputMode="decimal" value={row.rate} placeholder="13" onChange={(event) => setTaxes(taxes.map((other) => (other.key === row.key ? { ...other, rate: event.target.value } : other)))} className={input} />
                </div>
                <button type="button" aria-label={t("removeTax", { row: index + 1 })} onClick={() => setTaxes(taxes.filter((other) => other.key !== row.key))} className={cn(secondaryButton, "w-fit sm:h-10")}>
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {taxes.length < MAX_TAXES && (
          <button
            type="button"
            onClick={() => {
              setTaxes([...taxes, { key: nextKey, label: "", rate: "" }]);
              setNextKey(nextKey + 1);
            }}
            className={cn(secondaryButton, "w-fit")}
          >
            {t("addTax")}
          </button>
        )}
        <div className="grid gap-1.5 sm:max-w-sm">
          <Label htmlFor="invoice-tax-number">{t("taxNumber")}</Label>
          <Input id="invoice-tax-number" value={taxNumber} maxLength={30} onChange={(event) => setTaxNumber(event.target.value)} className={input} />
        </div>
      </section>

      <section aria-labelledby="invoice-total" className={cn(cardClass, "grid gap-3")}>
        <h2 id="invoice-total" className={headingClass}>{t("totals")}</h2>
        <dl className="grid gap-1 text-sm sm:max-w-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("subtotal")}</dt><dd className="tabular-nums">{formatMoney(totals.subtotal, locale)}</dd></div>
          {parsedTaxes.map((tax, index) => (
            <div key={taxes[index].key} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{tax.label || t("taxName")} {tax.rate_milli !== null ? `(${formatRate(tax.rate_milli, locale)})` : ""}</dt>
              <dd className="tabular-nums">{formatMoney(totals.taxAmounts[index], locale)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-border pt-1 font-bold"><dt>{t(kind === "invoice" ? "total" : "totalPaid")}</dt><dd className="tabular-nums">{formatMoney(totals.total, locale)}</dd></div>
        </dl>
        <div className="grid gap-1.5">
          <Label htmlFor="invoice-notes">{t("notes")}</Label>
          <Textarea id="invoice-notes" value={notes} maxLength={1000} rows={3} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {failure && <Notice kind="error">{problemText(failure)}</Notice>}
        {sent && <p role="status" className="text-sm font-medium">{t("sent", { label: sent.label, total: formatMoney(sent.total, locale), client: client?.name ?? clientEmail })}</p>}
        {preview && (
          <a href={preview} target="_blank" rel="noopener" className="text-sm font-semibold underline underline-offset-4">
            {t("openPreview")}
          </a>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={working} onClick={() => void showPreview()} className={secondaryButton}>{t("preview")}</button>
          <button type="submit" disabled={working || !list.mailing_address} className={primaryButton}>{working ? t("working") : t(kind === "invoice" ? "sendInvoice" : "sendReceipt")}</button>
        </div>
        <p className="text-xs text-muted-foreground">{t("sendHelp")}</p>
      </section>
    </form>
  );
}
