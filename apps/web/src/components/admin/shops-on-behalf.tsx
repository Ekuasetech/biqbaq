"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { useDashboard } from "@/components/dashboard/dashboard-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager } from "@/components/ui/pager";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLiveSearch } from "@/lib/use-live-search";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

interface ShopRow {
  id: string;
  name: string;
  city: string;
  status: string;
  publishing_suspended: boolean;
  verification_status: string;
}

/**
 * The shops an Admin or Co-admin can work on for the seller (PRD §3.4, roadmap item 8). The
 * list reads the shops table under its security rules, which show every shop only to those
 * who may edit products on behalf of sellers; opening one leads to that shop's own products
 * page, where the database checks each action again.
 */
export function ShopsOnBehalfScreen() {
  const t = useTranslations("shopsAdmin");
  const tAdmin = useTranslations("admin");
  const { user, data } = useDashboard();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ShopRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const allowed = Boolean(data?.access.on_behalf);
  // Filters as people type, and the button still searches at once.
  const searchNow = useLiveSearch(query, (next) => {
    setPage(1);
    setSearch(next);
  });

  const load = useCallback(async () => {
    const term = search.trim().replace(/[%_,()]/g, " ");
    let request = getSupabaseBrowserClient()
      .from("sellers")
      .select("id, name, city, status, publishing_suspended, verification_status", { count: "exact" })
      .order("name")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (term) request = request.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
    const { data: found, count, error } = await request;
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows((found ?? []) as ShopRow[]);
    setTotal(count ?? 0);
  }, [search, page]);

  useEffect(() => {
    if (!allowed) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [allowed, load]);

  if (user === undefined || (user && !data)) return <Skeleton className="h-64 rounded-3xl" aria-hidden />;
  if (!user || !allowed) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className="font-heading text-xl font-extrabold">{tAdmin("noAccessTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{user ? t("noAccess") : tAdmin("signInBody")}</p>
        <Link href={user ? "/account" : "/sign-in"} className={cn(primaryButton, "mt-5")}>{user ? tAdmin("backToAccount") : tAdmin("signIn")}</Link>
      </div>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    searchNow(query);
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <form onSubmit={submit} role="search" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="shop-search">{t("searchLabel")}</Label>
          <Input id="shop-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} maxLength={100} />
        </div>
        <button type="submit" className={primaryButton}>{t("searchButton")}</button>
      </form>
      {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
      {rows === null && !failed && <Skeleton className="h-40 rounded-3xl" aria-hidden />}
      {rows && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">{t("count", { count: total })}</p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="grid gap-3">
              {rows.map((shop) => {
                const verified = shop.verification_status === "provider_verified" || shop.verification_status === "manually_verified";
                return (
                  <li key={shop.id} className={cn(cardClass, "flex flex-wrap items-center justify-between gap-3")}>
                    <div className="min-w-0">
                      <h2 className="font-semibold break-words">{shop.name}</h2>
                      <p className="text-sm text-muted-foreground">{shop.city}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusPill tone={verified ? "good" : "neutral"}>{verified ? t("verified") : t("unverified")}</StatusPill>
                        {shop.status !== "active" && <StatusPill tone="bad">{t("suspended")}</StatusPill>}
                        {shop.publishing_suspended && <StatusPill tone="bad">{t("publishingSuspended")}</StatusPill>}
                      </div>
                    </div>
                    <Link
                      href={`/account/shop/products?seller=${shop.id}`}
                      prefetch={false}
                      aria-label={`${t("open")}: ${shop.name}`}
                      className={primaryButton}
                    >
                      {t("open")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} label={t("pagination")} />
        </>
      )}
    </div>
  );
}
