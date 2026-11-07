"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { SuperAdminOnly } from "@/components/admin/role-applications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE, auditActionMessageKey, listAuditLog, type AuditEntry } from "@/modules/audit";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function useActionLabel() {
  const t = useTranslations("auditLog");
  return (action: string) => {
    const key = `actions.${auditActionMessageKey(action)}`;
    return t.has(key) ? t(key) : action;
  };
}

function Entry({ entry }: { entry: AuditEntry }) {
  const t = useTranslations("auditLog");
  const format = useFormatter();
  const actionLabel = useActionLabel();
  const [open, setOpen] = useState(false);
  const hasDetails = Object.keys(entry.metadata ?? {}).length > 0;

  return (
    <li className="grid gap-1 border-t border-border py-3 text-sm first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-semibold">{actionLabel(entry.action)}</p>
        <time dateTime={entry.created_at} className="text-xs text-muted-foreground">
          {format.dateTime(new Date(entry.created_at), { dateStyle: "medium", timeStyle: "medium" })}
        </time>
      </div>
      <p className="break-words text-muted-foreground">
        {t("who", { name: entry.actor_name ?? entry.actor_email ?? t("system") })}
        {entry.actor_name && entry.actor_email && ` (${entry.actor_email})`}
      </p>
      {(entry.target_label || entry.target_id) && (
        <p className="break-words">{t("target", { target: entry.target_label ?? entry.target_id ?? "" })}</p>
      )}
      {entry.on_behalf_of_seller && <p className="break-words">{t("onBehalf", { seller: entry.on_behalf_of_seller })}</p>}
      {entry.reason && <p className="break-words">{t("reason", { reason: entry.reason })}</p>}
      {hasDetails && (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-fit text-sm font-semibold underline underline-offset-4">
            {t(open ? "hideDetails" : "showDetails")}
          </button>
          {open && <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">{JSON.stringify(entry.metadata, null, 2)}</pre>}
        </>
      )}
    </li>
  );
}

function AuditLog() {
  const t = useTranslations("auditLog");
  const actionLabel = useActionLabel();
  const [action, setAction] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listAuditLog(getSupabaseBrowserClient(), action, search, page);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as AuditEntry[]);
  }, [action, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(typed.trim());
  }

  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className={`${cardClass} grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end`} role="search">
        <div className="grid gap-1.5">
          <Label htmlFor="audit-action">{t("filterAction")}</Label>
          <select
            id="audit-action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            className="h-11 min-w-0 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t("allActions")}</option>
            {AUDIT_ACTIONS.map((name) => <option key={name} value={name}>{actionLabel(name)}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-search">{t("search")}</Label>
          <Input id="audit-search" value={typed} onChange={(event) => setTyped(event.target.value)} maxLength={200} className="h-11 text-base md:text-sm" />
        </div>
        <button type="submit" className={primaryButton}>{t("searchButton")}</button>
      </form>

      {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-64 rounded-3xl" />}
      {rows && (
        <section aria-label={t("results")} className={cardClass}>
          <p className="mb-3 text-sm text-muted-foreground">{t("count", { count: total })}</p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul>{rows.map((entry) => <Entry key={entry.id} entry={entry} />)}</ul>
          )}
        </section>
      )}
      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm">{t("page", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </nav>
      )}
    </div>
  );
}

export function AuditLogScreen() {
  return (
    <SuperAdminOnly>
      <AuditLog />
    </SuperAdminOnly>
  );
}
