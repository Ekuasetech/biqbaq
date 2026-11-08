"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { EmailListManager } from "@/components/email-lists/email-list-manager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { adminListShopLists, adminSetShopBulkEmail, type ShopEmailList } from "@/modules/email-lists";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/** Customer emails are off for every shop until Super Admin turns them on (Q-43). */
function ShopLists() {
  const t = useTranslations("emailListsAdmin");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ShopEmailList[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await adminListShopLists(getSupabaseBrowserClient(), query, page);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as ShopEmailList[]);
  }, [query, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const pages = Math.max(1, Math.ceil((rows?.[0]?.total ?? 0) / 20));
  return (
    <section aria-labelledby="shop-lists" className={cn(cardClass, "grid gap-3")}>
      <h2 id="shop-lists" className={headingClass}>{t("shopsTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("shopsIntro")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="shop-list-search">{t("search")}</Label>
          <Input id="shop-list-search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 text-base md:text-sm" />
        </div>
        <button type="submit" className={primaryButton}>{t("searchButton")}</button>
      </form>
      {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.seller_id}>
              <article aria-label={row.shop_name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="break-words font-semibold">{row.shop_name}</span>
                  <span className="block break-all text-xs text-muted-foreground">/sellers/{row.shop_slug}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("figures", { confirmed: row.confirmed, pending: row.pending })}
                    {row.last_sent_at && <> · {t("lastSent", { date: format.dateTime(new Date(row.last_sent_at), { dateStyle: "medium" }) })}</>}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={row.enabled ? "good" : row.pause_reason ? "bad" : "neutral"}>
                    {row.pause_reason ? t(`paused.${row.pause_reason}`) : t(row.enabled ? "on" : "off")}
                  </StatusPill>
                  <button
                    type="button"
                    onClick={async () => {
                      await adminSetShopBulkEmail(getSupabaseBrowserClient(), row.seller_id, !row.enabled);
                      await load();
                    }}
                    className={secondaryButton}
                  >
                    {t(row.enabled ? "turnOff" : "turnOn")}
                  </button>
                </span>
              </article>
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
    </section>
  );
}

export function EmailListsAdmin() {
  const t = useTranslations("emailListsAdmin");
  return (
    <div className="grid gap-4">
      <EmailListManager seller={null} title={t("biqbaqTitle")} />
      <ShopLists />
    </div>
  );
}
