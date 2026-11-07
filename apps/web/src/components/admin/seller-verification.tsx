"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { SuperAdminOnly } from "@/components/admin/role-applications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { refreshCatalog } from "@/modules/product-catalog/actions";
import {
  actionsFor,
  changeStatus,
  decide,
  isVerified,
  listForReview,
  loadHistory,
  REVIEW_FILTERS,
  REVIEW_PAGE_SIZE,
  verificationErrorKey,
  type ReviewFilter,
  type SellerForReview,
  type VerificationAction,
  type VerificationEvent,
  type VerificationStatus,
} from "@/modules/verification";

const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-bold transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";

export const verificationTone = (status: VerificationStatus) =>
  isVerified(status) ? "good" : status === "pending" ? "waiting" : status === "unverified" ? "neutral" : "bad";

function useDate() {
  const locale = useLocale();
  const format = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" });
  return (value: string) => format.format(new Date(value));
}

function History({ sellerId, version }: { sellerId: string; version: number }) {
  const t = useTranslations("verification");
  const date = useDate();
  const [events, setEvents] = useState<VerificationEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    loadHistory(getSupabaseBrowserClient(), sellerId).then(({ data, error }) => {
      if (!current) return;
      if (error) setFailed(true);
      else setEvents(data as VerificationEvent[]);
    });
    return () => {
      current = false;
    };
  }, [sellerId, version]);

  if (failed) return <Notice kind="error">{t("errors.generic")}</Notice>;
  if (!events) return <Skeleton className="h-10 rounded-xl" />;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">{t("noHistory")}</p>;

  return (
    <ol className="grid gap-2">
      {events.map((event) => (
        <li key={event.id} className="text-sm">
          <span className="font-medium">
            {t("historyChange", { from: t(`status.${event.from_status}`), to: t(`status.${event.to_status}`) })}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("historyBy", { name: event.actor_name ?? t("unknownPerson"), date: date(event.created_at) })}
          </span>
          {event.reason && <span className="block text-xs text-muted-foreground">{t("reason", { reason: event.reason })}</span>}
        </li>
      ))}
    </ol>
  );
}

type Pending = VerificationAction | "reject";

function SellerCard({ seller, onChanged }: { seller: SellerForReview; onChanged: (notice: string) => void }) {
  const t = useTranslations("verification");
  const date = useDate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>, notice: string) {
    setWorking(true);
    setFailure(null);
    const { error } = await action();
    setWorking(false);
    if (error) {
      setFailure(verificationErrorKey(error));
      return;
    }
    // The public Verified Seller label changes, so public pages should show it straight away.
    await refreshCatalog().catch(() => undefined);
    setVersion(version + 1);
    onChanged(notice);
  }

  const supabase = getSupabaseBrowserClient();

  function confirm(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    if (!reason.trim()) {
      setFailure("reasonRequired");
      return;
    }
    if (pending === "reject") {
      if (seller.request_id) void run(() => decide(supabase, seller.request_id!, false, reason), "rejected");
    } else {
      const action = pending;
      void run(() => changeStatus(supabase, seller.seller_id, action, reason), action);
    }
  }

  const actions = actionsFor(seller.verification_status);

  return (
    <li>
      <article className={cardClass} aria-label={seller.seller_name}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold break-words">{seller.seller_name}</h2>
            <p className="text-sm break-words text-muted-foreground">
              {seller.seller_city} · {seller.owner_email}
            </p>
          </div>
          <StatusPill tone={verificationTone(seller.verification_status)}>{t(`status.${seller.verification_status}`)}</StatusPill>
        </div>

        {seller.seller_status === "suspended" && <p className="mt-2 text-sm font-semibold">{t("shopSuspended")}</p>}
        {seller.publishing_suspended && <p className="mt-2 text-sm font-semibold">{t("publishingSuspended")}</p>}

        {seller.request_note && (
          <div className="mt-3 rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              {t("requestedOn", { date: date(seller.request_created_at ?? "") })}
            </p>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">{seller.request_note}</p>
          </div>
        )}

        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-3 text-sm font-semibold underline underline-offset-4">
          {open ? t("hideDetails") : t("viewDetails")}
        </button>

        {open && (
          <div className="mt-3 grid gap-4">
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("owner")}</dt>
                <dd className="break-words">{seller.owner_name ?? seller.owner_email}</dd>
              </div>
              {seller.contact_information && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("contact")}</dt>
                  <dd className="break-words">{seller.contact_information}</dd>
                </div>
              )}
              {seller.description && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("about")}</dt>
                  <dd className="break-words whitespace-pre-wrap">{seller.description}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">{t("products")}</dt>
                <dd>{seller.product_count}</dd>
              </div>
            </dl>
            {seller.seller_status === "active" && (
              <Link href={`/sellers/${seller.seller_slug}`} className="w-fit text-sm font-semibold underline underline-offset-4">
                {t("viewShop")}
              </Link>
            )}
            <section>
              <h3 className="mb-2 text-sm font-bold">{t("historyTitle")}</h3>
              <History sellerId={seller.seller_id} version={version} />
            </section>
          </div>
        )}

        {pending ? (
          <form onSubmit={confirm} noValidate className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${seller.seller_id}-reason`}>{t(`reasonFor.${pending}`)}</Label>
              <Textarea id={`${seller.seller_id}-reason`} value={reason} maxLength={1000} rows={2} onChange={(event) => setReason(event.target.value)} className="rounded-xl" />
              {pending === "reject" && <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t(`confirm.${pending}`)}</button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setFailure(null);
                }}
                className={secondaryButton}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : (
          (seller.request_id || actions.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {seller.request_id && (
                <>
                  <button type="button" disabled={working} onClick={() => void run(() => decide(supabase, seller.request_id!, true), "approved")} className={primaryButton}>
                    {t("approve")}
                  </button>
                  <button type="button" onClick={() => setPending("reject")} className={secondaryButton}>{t("reject")}</button>
                </>
              )}
              {actions.map((action) => (
                <button key={action} type="button" onClick={() => setPending(action)} className={secondaryButton}>
                  {t(`action.${action}`)}
                </button>
              ))}
            </div>
          )
        )}
        {failure && <div className="mt-3"><Notice kind="error">{t(`errors.${failure}`)}</Notice></div>}
      </article>
    </li>
  );
}

function ReviewList() {
  const t = useTranslations("verification");
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SellerForReview[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await listForReview(getSupabaseBrowserClient(), filter, search, page);
    if (error) {
      setFailure(verificationErrorKey(error));
      return;
    }
    setFailure(null);
    setRows(data as SellerForReview[]);
  }, [filter, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {t("applicationsHint")}{" "}
        <Link href="/admin/role-applications" className="font-semibold text-foreground underline underline-offset-4">
          {t("applicationsLink")}
        </Link>
      </p>
      <div className="grid gap-4 rounded-3xl bg-card p-4 shadow-sm sm:p-5">
        <div role="group" aria-label={t("statusFilter")} className="flex flex-wrap gap-2">
          {REVIEW_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(1);
                setNotice(null);
              }}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
              )}
            >
              {value === "all" ? t("all") : t(`status.${value}`)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(typed.trim());
            setPage(1);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="grid min-w-52 flex-1 gap-1">
            <Label htmlFor="verification-search" className="text-xs">{t("searchLabel")}</Label>
            <Input
              id="verification-search"
              type="search"
              maxLength={100}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 text-base md:text-sm"
            />
          </div>
          <button type="submit" className={cn(secondaryButton, "h-10")}>{t("searchButton")}</button>
        </form>
      </div>

      {notice && <Notice kind="info">{t(`done.${notice}`)}</Notice>}
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      {!rows && !failure && <Skeleton className="h-40 rounded-3xl" />}
      {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{t("count", { count: total })}</p>
          <ul className="grid gap-3">
            {rows.map((seller) => (
              <SellerCard
                key={seller.seller_id}
                seller={seller}
                onChanged={(message) => {
                  setNotice(message);
                  void load();
                }}
              />
            ))}
          </ul>
        </>
      )}
      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm text-muted-foreground">{t("pageOf", { page, total: pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </nav>
      )}
    </div>
  );
}

export function SellerVerificationScreen() {
  return (
    <SuperAdminOnly>
      <ReviewList />
    </SuperAdminOnly>
  );
}
