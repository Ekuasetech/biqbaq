"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ADMIN_PAGE_SIZE, adminListCodes, adminSetCode, normalizeCode, referralErrorKey, type AdminReferralCode } from "@/modules/referrals";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const TYPES = ["all", "marketer", "seller"] as const;

function EditCode({ row, onDone }: { row: AdminReferralCode; onDone: () => Promise<void> }) {
  const t = useTranslations("referralsAdmin");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.code);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const code = normalizeCode(value);
    if (!code) {
      setFailure("codeInvalid");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await adminSetCode(getSupabaseBrowserClient(), row.code_id, code);
    setWorking(false);
    if (error) {
      setFailure(referralErrorKey(error));
      return;
    }
    setEditing(false);
    await onDone();
  }

  if (!editing) {
    return <button type="button" onClick={() => setEditing(true)} className={cn(secondaryButton, "mt-3")}>{t("change")}</button>;
  }
  const field = `code-${row.code_id}`;
  return (
    <form onSubmit={save} noValidate className="mt-3 grid gap-2">
      <Label htmlFor={field}>{t("newCode")}</Label>
      <Input id={field} value={value} maxLength={20} onChange={(event) => setValue(event.target.value)} className="h-11 font-mono text-base uppercase md:text-sm" />
      <p className="text-xs text-muted-foreground">{t("changeHint")}</p>
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{t("save")}</button>
        <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

/** Every referral programme, marketers and shops kept apart (§14.5). */
export function ReferralsAdmin() {
  const t = useTranslations("referralsAdmin");
  const [type, setType] = useState<string>("marketer");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminReferralCode[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminListCodes(getSupabaseBrowserClient(), type, query, page);
    if (error) {
      setFailed(error.code === "42501" ? "notAllowed" : "loadFailed");
      return;
    }
    setFailed(null);
    setRows(data as AdminReferralCode[]);
  }, [type, query, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const pages = Math.max(1, Math.ceil((rows?.[0]?.total_count ?? 0) / ADMIN_PAGE_SIZE));
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div className={cn(cardClass, "grid gap-3")}>
        <div role="tablist" aria-label={t("typeLabel")} className="flex flex-wrap gap-2">
          {TYPES.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={type === name}
              onClick={() => {
                setType(name);
                setPage(1);
              }}
              className={cn(secondaryButton, type === name && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
            >
              {t(`types.${name}`)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="referral-search">{t("search")}</Label>
            <Input id="referral-search" value={search} placeholder={t("searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} className="h-11 text-base md:text-sm" />
          </div>
          <button type="submit" className={primaryButton}>{t("searchButton")}</button>
        </form>
      </div>
      {failed && <Notice kind="error">{t(`errors.${failed}`)}</Notice>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((row) => {
            const name = row.owner_type === "seller" ? (row.shop_name ?? "") : row.owner_name || (row.owner_email ?? "");
            return (
              <li key={row.code_id}>
                <article aria-label={name} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="break-words font-semibold">{name}</h2>
                      <p className="break-words text-sm text-muted-foreground">
                        <span className="font-mono font-semibold text-foreground">{row.code}</span> · {row.owner_email}
                      </p>
                      <p className="text-sm">{t("figures", { total: row.total, month: row.this_month, waiting: row.waiting })}</p>
                    </div>
                    <StatusPill tone={row.usable ? "good" : "neutral"}>{t(row.usable ? "active" : "inactive")}</StatusPill>
                  </div>
                  <EditCode row={row} onDone={load} />
                </article>
              </li>
            );
          })}
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
