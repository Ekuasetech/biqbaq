"use client";

import { useScrollToHash } from "@/lib/use-scroll-to-hash";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  addClients,
  BODY_MAX,
  emailListErrorKey,
  getList,
  listCampaigns,
  listSubscribers,
  removeSubscriber,
  stopUpdates,
  sendCampaign,
  setMailingAddress,
  SUBJECT_MAX,
  SUBSCRIBERS_PAGE_SIZE,
  type Campaign,
  type EmailList,
  type Subscriber,
} from "@/modules/email-lists";
import { formatMoney, invoiceErrorKey, listInvoices, resendInvoice, type InvoiceSummary } from "@/modules/invoicing";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const STATUSES = ["all", "confirmed", "client", "unsubscribed", "bounced"] as const;

function useErrorText() {
  const t = useTranslations("emailLists");
  return (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));
}

function MailingAddress({ seller, list, onSaved }: { seller: string | null; list: EmailList; onSaved: () => Promise<void> }) {
  const t = useTranslations("emailLists");
  const errorText = useErrorText();
  const [value, setValue] = useState(list.mailing_address ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (value.trim().length < ADDRESS_MIN) {
      setFailure("addressInvalid");
      return;
    }
    const { error } = await setMailingAddress(getSupabaseBrowserClient(), seller, value.trim());
    if (error) {
      setFailure(emailListErrorKey(error));
      return;
    }
    setFailure(null);
    setSaved(true);
    await onSaved();
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-2">
      <Label htmlFor="list-address">{t("address.label")}</Label>
      <Input id="list-address" value={value} maxLength={ADDRESS_MAX} onChange={(event) => setValue(event.target.value)} className="h-11 text-base md:text-sm" />
      <p className="text-xs text-muted-foreground">{t("address.hint")}</p>
      {failure && <Notice kind="error">{errorText(failure)}</Notice>}
      {saved && <p role="status" className="text-sm text-muted-foreground">{t("saved")}</p>}
      <button type="submit" className={cn(secondaryButton, "w-fit")}>{t("address.save")}</button>
    </form>
  );
}

interface ClientRow {
  key: number;
  name: string;
  email: string;
  phone: string;
  invite: boolean;
}

const blankRow = (key: number): ClientRow => ({ key, name: "", email: "", phone: "", invite: false });
const EMAIL = /^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[0-9 ()./-]{7,25}$/;

/** Checks one row as the database will, naming the first problem. */
function rowProblem(row: ClientRow): "nameRequired" | "emailInvalid" | "phoneInvalid" | null {
  if (!row.name.trim()) return "nameRequired";
  if (!EMAIL.test(row.email.trim())) return "emailInvalid";
  const phone = row.phone.trim();
  if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 7)) return "phoneInvalid";
  return null;
}

/**
 * Clients entered in a table: name and email, and a phone if they gave one (Q-48). On a
 * phone each row becomes its own card. "Send updates" asks them to join the shop's emails (Q-49).
 */
function AddClients({ seller, list, onAdded }: { seller: string | null; list: EmailList; onAdded: () => Promise<void> }) {
  const t = useTranslations("emailLists");
  const errorText = useErrorText();
  const [rows, setRows] = useState<ClientRow[]>([blankRow(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<{ key: string; row?: number } | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; invited: number; unsubscribed: number } | null>(null);

  const update = (key: number, change: Partial<ClientRow>) => setRows(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const anyInvite = rows.some((row) => row.invite);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    setResult(null);
    const filled = rows.filter((row) => row.name.trim() || row.email.trim() || row.phone.trim());
    if (filled.length === 0) return setFailure({ key: "noClients" });
    for (const [index, row] of filled.entries()) {
      const problem = rowProblem(row);
      if (problem) return setFailure({ key: problem, row: rows.indexOf(row) + 1 || index + 1 });
    }
    const emails = filled.map((row) => row.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) return setFailure({ key: "emailRepeated" });
    if (filled.some((row) => row.invite) && !consent) return setFailure({ key: "consentRequired" });

    setWorking(true);
    setFailure(null);
    const { data, error } = await addClients(
      getSupabaseBrowserClient(),
      seller,
      filled.map((row) => ({ name: row.name.trim(), email: row.email.trim(), phone: row.phone.trim() || null, invite: row.invite })),
      consent,
    );
    setWorking(false);
    if (error) return setFailure({ key: emailListErrorKey(error) });
    setResult((data as { added: number; updated: number; invited: number; unsubscribed: number }[])[0]);
    setRows([blankRow(nextKey)]);
    setNextKey(nextKey + 1);
    setConsent(false);
    await onAdded();
  }

  const cell = "block md:table-cell md:px-2 md:py-1.5 md:align-top";
  const input = "h-10 text-base md:text-sm";
  return (
    <form onSubmit={save} noValidate aria-label={t("add.title")} className="grid gap-3">
      <h3 className="font-semibold">{t("add.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("add.hint")}</p>
      <table className="block w-full md:table md:border-collapse">
        <caption className="sr-only">{t("add.title")}</caption>
        <thead className="hidden md:table-header-group">
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="px-2 pb-1 font-semibold">{t("add.name")}</th>
            <th scope="col" className="px-2 pb-1 font-semibold">{t("add.email")}</th>
            <th scope="col" className="px-2 pb-1 font-semibold">{t("add.phone")}</th>
            <th scope="col" className="px-2 pb-1 font-semibold">{t("add.invite")}</th>
            <th scope="col" className="px-2 pb-1"><span className="sr-only">{t("add.actions")}</span></th>
          </tr>
        </thead>
        <tbody className="grid gap-3 md:table-row-group">
          {rows.map((row, index) => {
            const label = (field: string) => t("add.fieldLabel", { field: t(`add.${field}`), row: index + 1 });
            return (
              <tr key={row.key} className="grid gap-2 rounded-2xl bg-muted/40 p-3 md:table-row md:bg-transparent md:p-0">
                <td className={cell}>
                  <Label htmlFor={`client-${row.key}-name`} className="mb-1 md:sr-only">{label("name")}</Label>
                  <Input id={`client-${row.key}-name`} value={row.name} maxLength={100} autoComplete="off" onChange={(event) => update(row.key, { name: event.target.value })} className={input} />
                </td>
                <td className={cell}>
                  <Label htmlFor={`client-${row.key}-email`} className="mb-1 md:sr-only">{label("email")}</Label>
                  <Input id={`client-${row.key}-email`} type="email" inputMode="email" value={row.email} maxLength={254} autoComplete="off" onChange={(event) => update(row.key, { email: event.target.value })} className={input} />
                </td>
                <td className={cell}>
                  <Label htmlFor={`client-${row.key}-phone`} className="mb-1 md:sr-only">{label("phone")}</Label>
                  <Input id={`client-${row.key}-phone`} type="tel" inputMode="tel" value={row.phone} maxLength={25} autoComplete="off" onChange={(event) => update(row.key, { phone: event.target.value })} className={input} />
                </td>
                <td className={cn(cell, "md:text-center")}>
                  <label className="flex items-center gap-2 text-sm md:h-10 md:justify-center">
                    <input type="checkbox" checked={row.invite} onChange={(event) => update(row.key, { invite: event.target.checked })} className="size-4 accent-primary" />
                    <span className="md:sr-only">{label("invite")}</span>
                  </label>
                </td>
                <td className={cn(cell, "md:text-right")}>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      aria-label={t("add.removeRow", { row: index + 1 })}
                      onClick={() => setRows(rows.filter((other) => other.key !== row.key))}
                      className={cn(secondaryButton, "md:h-10")}
                    >
                      {t("add.remove")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length < 50 && (
        <button
          type="button"
          onClick={() => {
            setRows([...rows, blankRow(nextKey)]);
            setNextKey(nextKey + 1);
          }}
          className={cn(secondaryButton, "w-fit")}
        >
          {t("add.addRow")}
        </button>
      )}
      {anyInvite && (
        <>
          <p className="text-xs text-muted-foreground">{t("add.inviteHint", { left: Math.max(0, list.max_new_addresses - list.added_today) })}</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>{t("add.consent")}</span>
          </label>
        </>
      )}
      {failure && <Notice kind="error">{failure.row ? t("add.rowProblem", { row: failure.row, problem: errorText(failure.key) }) : errorText(failure.key)}</Notice>}
      {result && <p role="status" className="text-sm">{t("add.result", result)}</p>}
      <button type="submit" disabled={working} className={cn(primaryButton, "w-fit")}>{working ? t("working") : t("add.button")}</button>
    </form>
  );
}

function Subscribers({
  seller,
  version,
  onChanged,
  onEmail,
}: {
  seller: string | null;
  version: number;
  onChanged: () => Promise<void>;
  onEmail: (email: string) => void;
}) {
  const t = useTranslations("emailLists");
  const format = useFormatter();
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Subscriber[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await listSubscribers(getSupabaseBrowserClient(), seller, status, page);
    setRows((data ?? []) as Subscriber[]);
  }, [seller, status, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, version]);

  useScrollToHash(rows !== null);
  const pages = Math.max(1, Math.ceil((rows?.[0]?.total ?? 0) / SUBSCRIBERS_PAGE_SIZE));
  return (
    <div className="grid gap-2">
      <h3 className="font-semibold">{t("people.title")}</h3>
      <div role="tablist" aria-label={t("people.filter")} className="flex flex-wrap gap-2">
        {STATUSES.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={status === name}
            onClick={() => {
              setStatus(name);
              setPage(1);
            }}
            className={cn(secondaryButton, status === name && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
          >
            {t(`people.statuses.${name}`)}
          </button>
        ))}
      </div>
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("people.empty")}</p>}
      {rows && rows.length > 0 && (
        <ul aria-label={t("people.title")} className="grid gap-1">
          {rows.map((row) => (
            <li key={row.email} id={`client-${row.email}`} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0 break-words">
                <span className="font-semibold">{row.name || row.email}</span>
                <span className="block break-all">{row.email}{row.phone ? ` · ${row.phone}` : ""}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(`people.source.${row.source}`)} · {format.dateTime(new Date(row.created_at), { dateStyle: "medium" })}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <StatusPill tone={row.status === "confirmed" ? "good" : row.status === "pending" ? "waiting" : row.status === "bounced" ? "bad" : "neutral"}>
                  {t(`people.statuses.${row.status}`)}
                </StatusPill>
                {row.status === "confirmed" && (
                  <button type="button" aria-label={t("people.emailLabel", { name: row.name || row.email })} onClick={() => onEmail(row.email)} className={secondaryButton}>
                    {t("people.email")}
                  </button>
                )}
                {(row.status === "confirmed" || row.status === "pending") && (
                  <button
                    type="button"
                    aria-label={t("people.stopLabel", { name: row.name || row.email })}
                    onClick={async () => {
                      await stopUpdates(getSupabaseBrowserClient(), seller, row.email);
                      await onChanged();
                    }}
                    className={secondaryButton}
                  >
                    {t("people.stop")}
                  </button>
                )}
                <Link
                  href={`/account/invoices/new?client=${encodeURIComponent(row.email)}${seller ? `&seller=${seller}` : ""}`}
                  className={secondaryButton}
                >
                  {t("people.invoice")}
                </Link>
                {row.status !== "unsubscribed" && row.status !== "bounced" && (
                  <button
                    type="button"
                    aria-label={t("people.removeLabel", { email: row.email })}
                    onClick={async () => {
                      await removeSubscriber(getSupabaseBrowserClient(), seller, row.email);
                      await onChanged();
                    }}
                    className={secondaryButton}
                  >
                    {t("people.remove")}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm text-muted-foreground">{t("page", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </div>
      )}
    </div>
  );
}

/** To every client receiving updates, or to one of them (Q-54). */
function Compose({
  seller,
  list,
  to,
  onTo,
  onSent,
}: {
  seller: string | null;
  list: EmailList;
  to: string;
  onTo: (email: string) => void;
  onSent: () => Promise<void>;
}) {
  const t = useTranslations("emailLists");
  const errorText = useErrorText();
  const [receiving, setReceiving] = useState<Subscriber[]>([]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await getSupabaseBrowserClient().rpc("list_subscribers_page", { p_seller: seller, p_status: "confirmed", p_limit: 200 });
      setReceiving(((data ?? []) as Subscriber[]).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)));
    }, 0);
    return () => clearTimeout(timer);
  }, [seller, list.confirmed]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  function review(event: FormEvent) {
    event.preventDefault();
    setSent(null);
    if (!subject.trim() || !body.trim()) {
      setFailure("detailsInvalid");
      return;
    }
    setFailure(null);
    setConfirming(true);
  }

  async function send() {
    if (working) return;
    setWorking(true);
    const { data, error } = await sendCampaign(getSupabaseBrowserClient(), seller, subject.trim(), body.trim(), to || null);
    setWorking(false);
    setConfirming(false);
    if (error) {
      setFailure(emailListErrorKey(error));
      return;
    }
    setSent(data as number);
    setSubject("");
    setBody("");
    await onSent();
  }

  const left = Math.max(0, list.max_recipients - list.recipients_today);
  const person = receiving.find((row) => row.email === to);
  return (
    <form id="email-compose" onSubmit={review} noValidate aria-label={t("compose.title")} className="grid gap-2">
      <h3 className="font-semibold">{t("compose.title")}</h3>
      <p className="text-xs text-muted-foreground">
        {to
          ? t("compose.singleLimits", { singles: Math.max(0, list.max_singles - list.singles_today), people: left })
          : t("compose.limits", { campaigns: Math.max(0, list.max_campaigns - list.campaigns_today), people: left })}
      </p>
      <Label htmlFor="campaign-to">{t("compose.to")}</Label>
      <select
        id="campaign-to"
        value={to}
        onChange={(event) => {
          onTo(event.target.value);
          setConfirming(false);
        }}
        className="h-11 w-full min-w-0 max-w-full truncate rounded-lg border border-input bg-card px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
      >
        <option value="">{t("compose.everyone", { count: list.confirmed })}</option>
        {receiving.map((row) => (
          <option key={row.email} value={row.email}>{row.name ? `${row.name} (${row.email})` : row.email}</option>
        ))}
      </select>
      <Label htmlFor="campaign-subject">{t("compose.subject")}</Label>
      <Input id="campaign-subject" value={subject} maxLength={SUBJECT_MAX} onChange={(event) => setSubject(event.target.value)} className="h-11 text-base md:text-sm" />
      <Label htmlFor="campaign-body">{t("compose.body")}</Label>
      <Textarea id="campaign-body" value={body} maxLength={BODY_MAX} rows={6} onChange={(event) => setBody(event.target.value)} />
      <p className="text-xs text-muted-foreground">{t("compose.footerNote", { sender: list.sender_name ?? "" })}</p>
      {failure && <Notice kind="error">{errorText(failure)}</Notice>}
      {sent !== null && <p role="status" className="text-sm">{t("compose.sent", { count: sent })}</p>}
      {confirming ? (
        <div className="grid gap-2 rounded-xl bg-muted/50 p-3">
          <p className="text-sm">{to ? t("compose.confirmOne", { name: person?.name || to }) : t("compose.confirm", { count: list.confirmed })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={working} onClick={() => void send()} className={primaryButton}>{working ? t("working") : t("compose.confirmButton")}</button>
            <button type="button" onClick={() => setConfirming(false)} className={secondaryButton}>{t("cancel")}</button>
          </div>
        </div>
      ) : (
        <button type="submit" className={cn(primaryButton, "w-fit")}>{t("compose.review")}</button>
      )}
    </form>
  );
}

function Campaigns({ seller, version }: { seller: string | null; version: number }) {
  const t = useTranslations("emailLists");
  const format = useFormatter();
  const [rows, setRows] = useState<Campaign[] | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await listCampaigns(getSupabaseBrowserClient(), seller);
      setRows((data ?? []) as Campaign[]);
    }, 0);
    return () => clearTimeout(timer);
  }, [seller, version]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h3 className="font-semibold">{t("history.title")}</h3>
      <ul aria-label={t("history.title")} className="grid gap-1">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-muted/40 px-3 py-2 text-sm">
            <span className="break-words font-medium">{row.subject}</span>
            <span className="block text-xs text-muted-foreground">
              {row.single_email
                ? t("history.single", { email: row.single_email, date: format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "short" }) })
                : t("history.line", { count: row.recipients, date: format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "short" }) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Invoices and receipts already sent, to download or send again (Q-50). */
function Documents({ seller, version }: { seller: string | null; version: number }) {
  const t = useTranslations("emailLists");
  const locale = useLocale();
  const format = useFormatter();
  const errorText = useErrorText();
  const [rows, setRows] = useState<InvoiceSummary[] | null>(null);
  const [message, setMessage] = useState<{ id: string; key: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await listInvoices(getSupabaseBrowserClient(), seller);
    setRows((data ?? []) as InvoiceSummary[]);
  }, [seller]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, version]);

  useScrollToHash(rows !== null);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("documents.title")}</h3>
        <Link href={`/account/invoices/new${seller ? `?seller=${seller}` : ""}`} className={secondaryButton}>{t("documents.new")}</Link>
      </div>
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>}
      {rows && rows.length > 0 && (
        <ul aria-label={t("documents.title")} className="grid gap-1">
          {rows.map((row) => (
            <li key={row.id} id={`invoice-${row.id}`} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0 break-words">
                <span className="font-semibold">{row.label}</span> · {row.client_name}
                <span className="block text-xs text-muted-foreground">
                  {t(`documents.kind.${row.kind}`)} · {formatMoney(row.total_minor, locale)} · {format.dateTime(new Date(row.created_at), { dateStyle: "medium" })}
                  {row.send_count > 1 ? ` · ${t("documents.sentTimes", { count: row.send_count })}` : ""}
                </span>
                {message?.id === row.id && <span role="status" className="block text-xs">{message.key === "resent" ? t("documents.resent") : errorText(message.key)}</span>}
              </span>
              <span className="flex flex-wrap gap-2">
                <a href={`/api/v1/invoices/${row.id}/pdf?locale=${locale}${seller ? `&seller=${seller}` : ""}`} className={secondaryButton}>
                  {t("documents.download")}
                </a>
                {row.send_count < 3 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const { error } = await resendInvoice(getSupabaseBrowserClient(), seller, row.id);
                      setMessage({ id: row.id, key: error ? invoiceErrorKey(error) : "resent" });
                      await load();
                    }}
                    className={secondaryButton}
                  >
                    {t("documents.resend")}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A shop's customer list (seller set), or Biqbaq's own (null), and bulk email to it.
 * Only confirmed addresses are ever sent to (Q-42).
 */
export function EmailListManager({
  seller,
  title,
  view = "all",
}: {
  seller: string | null;
  title: string;
  /** My shop shows clients and emails on one page and invoices on another (Q-56); Biqbaq's list shows both. */
  view?: "all" | "emails" | "invoices";
}) {
  const t = useTranslations("emailLists");
  const [list, setList] = useState<EmailList | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await getList(getSupabaseBrowserClient(), seller);
    if (error) {
      setFailed(true);
      return;
    }
    setList((data as EmailList[])[0] ?? null);
    setVersion((v) => v + 1);
  }, [seller]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section id="customer-emails" aria-labelledby="email-list-title" className={cn(cardClass, "grid scroll-mt-24 gap-5")}>
      <div>
        <h2 id="email-list-title" className={headingClass}>{title}</h2>
        {list?.enabled && <p className="mt-1 text-sm text-muted-foreground">{t(view === "invoices" ? "invoicesIntro" : "intro")}</p>}
      </div>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {list && !list.enabled && (list.pause_reason ? <Notice kind="error">{t(`paused.${list.pause_reason}`)}</Notice> : <p className="text-sm text-muted-foreground">{t("off")}</p>)}
      {list?.enabled && view === "invoices" && (
        <>
          {!list.mailing_address && (
            <div className="grid gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm">{t("invoicesNeedAddress")}</p>
              <MailingAddress seller={seller} list={list} onSaved={load} />
            </div>
          )}
          <Documents seller={seller} version={version} />
        </>
      )}
      {list?.enabled && view !== "invoices" && (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {(["clients", "confirmed", "unsubscribed"] as const).map((name) => (
              <div key={name} className="rounded-2xl bg-muted/50 px-4 py-3">
                <dt className="text-xs text-muted-foreground">{t(`stats.${name}`)}</dt>
                <dd className="font-heading text-2xl font-extrabold">{list[name]}</dd>
              </div>
            ))}
          </dl>
          {list.mailing_address ? (
            <Compose seller={seller} list={list} to={to} onTo={setTo} onSent={load} />
          ) : (
            // The send form appears once the address the law requires is saved.
            <div id="email-compose" className="grid gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
              <h3 className="font-semibold">{t("compose.title")}</h3>
              <p className="text-sm">{t("compose.needsAddress")}</p>
              <MailingAddress seller={seller} list={list} onSaved={load} />
            </div>
          )}
          {list.mailing_address && <MailingAddress seller={seller} list={list} onSaved={load} />}
          <Campaigns seller={seller} version={version} />
          {view === "all" && <Documents seller={seller} version={version} />}
          <AddClients seller={seller} list={list} onAdded={load} />
          <Subscribers
            seller={seller}
            version={version}
            onChanged={load}
            onEmail={(email) => {
              setTo(email);
              document.getElementById("email-compose")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </>
      )}
    </section>
  );
}
