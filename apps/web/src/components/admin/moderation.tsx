"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import {
  getModerationAccess,
  hasAnyAccess,
  listProducts,
  listShops,
  MODERATION_PAGE_SIZE,
  moderationErrorKey,
  PRODUCT_FILTERS,
  REASON_MAX_LENGTH,
  restoreProduct,
  setShopPublishing,
  setShopStatus,
  SHOP_FILTERS,
  suspendProduct,
  type ModerationAccess,
  type ModerationProduct,
  type ModerationShop,
} from "@/modules/moderation";
import { refreshCatalog } from "@/modules/product-catalog/actions";
import { listReviewsForModeration, setReviewHidden, type ReviewForModeration } from "@/modules/reviews";

// Links on these lists do not prefetch: what they point to may be suspended a moment later.
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";

type Result = PromiseLike<{ error: { code?: string; message?: string } | null }>;

/** One action with a required reason. The seller reads the reason in their email. */
function ReasonAction({
  label,
  id,
  destructive,
  hint,
  onConfirm,
  onDone,
}: {
  label: string;
  id: string;
  destructive?: boolean;
  hint?: string;
  onConfirm: (reason: string) => Result;
  onDone: () => Promise<void>;
}) {
  const t = useTranslations("moderation");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!reason.trim()) {
      setFailure("reasonRequired");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await onConfirm(reason);
    if (error) {
      setFailure(moderationErrorKey(error));
      setWorking(false);
      // Someone else may have got there first, so show what is true now.
      if (moderationErrorKey(error) === "changed") await onDone();
      return;
    }
    // The change is saved. If this refresh fails, public pages catch up within about a minute.
    await refreshCatalog().catch(() => undefined);
    await onDone();
    setWorking(false);
    setOpen(false);
    setReason("");
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>{label}</button>;
  }
  return (
    <form onSubmit={submit} noValidate aria-label={label} className="grid w-full gap-2 rounded-2xl bg-muted/50 p-4">
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{t("reason")}</Label>
        <Textarea id={id} value={reason} rows={2} maxLength={REASON_MAX_LENGTH} onChange={(event) => setReason(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={destructive ? cn(primaryButton, "bg-destructive hover:bg-destructive/90") : primaryButton}>
          {working ? t("working") : t("confirm", { action: label })}
        </button>
        <button type="button" onClick={() => { setOpen(false); setFailure(null); }} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function SearchBar({
  id,
  filters,
  filter,
  label,
  onFilter,
  onSearch,
}: {
  id: string;
  filters: readonly string[];
  filter: string;
  label: (filter: string) => string;
  onFilter: (filter: string) => void;
  onSearch: (search: string) => void;
}) {
  const t = useTranslations("moderation");
  const [typed, setTyped] = useState("");
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(typed.trim());
      }}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-filter`}>{t("show")}</Label>
        <select
          id={`${id}-filter`}
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          className="h-11 min-w-0 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {filters.map((name) => <option key={name} value={name}>{label(name)}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-search`}>{t("search")}</Label>
        <Input id={`${id}-search`} value={typed} maxLength={200} onChange={(event) => setTyped(event.target.value)} className="h-11 text-base md:text-sm" />
      </div>
      <button type="submit" className={primaryButton}>{t("searchButton")}</button>
    </form>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const t = useTranslations("moderation");
  const pages = Math.max(1, Math.ceil(total / MODERATION_PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
      <span className="text-sm">{t("page", { page, pages })}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={secondaryButton}>{t("next")}</button>
    </nav>
  );
}

function ProductsPanel() {
  const t = useTranslations("moderation");
  const locale = useLocale();
  const [filter, setFilter] = useState<string>("published");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ModerationProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listProducts(getSupabaseBrowserClient(), filter, search, page);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as ModerationProduct[]);
  }, [filter, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const supabase = getSupabaseBrowserClient();
  return (
    <section aria-labelledby="moderation-products" className="grid gap-3">
      <h2 id="moderation-products" className={headingClass}>{t("products.title")}</h2>
      <div className={cardClass}>
        <SearchBar
          id="products"
          filters={PRODUCT_FILTERS}
          filter={filter}
          label={(name) => t(`products.filters.${name}`)}
          onFilter={(next) => { setFilter(next); setPage(1); }}
          onSearch={(next) => { setSearch(next); setPage(1); }}
        />
      </div>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((product) => (
            <li key={product.id}>
              <article aria-label={product.name} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">
                      {product.status === "published" && product.seller_active ? <Link href={`/products/${product.slug}`} prefetch={false} className="underline underline-offset-4">{product.name}</Link> : product.name}
                    </h3>
                    <p className="break-words text-sm text-muted-foreground">
                      {product.seller_name} · {formatPrice({ amountMinor: product.price_minor, currency: product.currency }, locale)}
                    </p>
                  </div>
                  <StatusPill tone={product.status === "published" ? "good" : product.status === "suspended" ? "bad" : "neutral"}>
                    {t(`products.status.${product.status}`)}
                  </StatusPill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.status === "suspended" ? (
                    <ReasonAction
                      id={`restore-${product.id}`}
                      label={t("products.restore")}
                      hint={t("products.restoreHint")}
                      onConfirm={(reason) => restoreProduct(supabase, product.id, reason)}
                      onDone={load}
                    />
                  ) : (
                    <ReasonAction
                      id={`suspend-${product.id}`}
                      label={t("products.suspend")}
                      destructive
                      onConfirm={(reason) => suspendProduct(supabase, product.id, reason)}
                      onDone={load}
                    />
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 0 && <Pager page={page} total={rows[0].total} onPage={setPage} />}
    </section>
  );
}

function ShopsPanel({ access }: { access: ModerationAccess }) {
  const t = useTranslations("moderation");
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ModerationShop[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listShops(getSupabaseBrowserClient(), filter, search, page);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as ModerationShop[]);
  }, [filter, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const supabase = getSupabaseBrowserClient();
  return (
    <section aria-labelledby="moderation-shops" className="grid gap-3">
      <h2 id="moderation-shops" className={headingClass}>{t("shops.title")}</h2>
      <div className={cardClass}>
        <SearchBar
          id="shops"
          filters={SHOP_FILTERS}
          filter={filter}
          label={(name) => t(`shops.filters.${name}`)}
          onFilter={(next) => { setFilter(next); setPage(1); }}
          onSearch={(next) => { setSearch(next); setPage(1); }}
        />
      </div>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((shop) => (
            <li key={shop.id}>
              <article aria-label={shop.name} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">
                      {shop.status === "active" ? <Link href={`/sellers/${shop.slug}`} prefetch={false} className="underline underline-offset-4">{shop.name}</Link> : shop.name}
                    </h3>
                    <p className="break-words text-sm text-muted-foreground">
                      {shop.city} · {t("shops.products", { count: shop.product_count })}
                      {shop.owner_email && <> · {shop.owner_email}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill tone={shop.status === "active" ? "good" : "bad"}>{t(`shops.status.${shop.status}`)}</StatusPill>
                    {shop.publishing_suspended && <StatusPill tone="bad">{t("shops.publishingOff")}</StatusPill>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {access.shops && (shop.status === "active" ? (
                    <ReasonAction
                      id={`shop-suspend-${shop.id}`}
                      label={t("shops.suspend")}
                      destructive
                      hint={t("shops.suspendHint")}
                      onConfirm={(reason) => setShopStatus(supabase, shop.id, "suspended", reason)}
                      onDone={load}
                    />
                  ) : (
                    <ReasonAction
                      id={`shop-restore-${shop.id}`}
                      label={t("shops.restore")}
                      onConfirm={(reason) => setShopStatus(supabase, shop.id, "active", reason)}
                      onDone={load}
                    />
                  ))}
                  {access.publishing && (shop.publishing_suspended ? (
                    <ReasonAction
                      id={`publishing-restore-${shop.id}`}
                      label={t("shops.restorePublishing")}
                      onConfirm={(reason) => setShopPublishing(supabase, shop.id, false, reason)}
                      onDone={load}
                    />
                  ) : (
                    <ReasonAction
                      id={`publishing-suspend-${shop.id}`}
                      label={t("shops.suspendPublishing")}
                      destructive
                      hint={t("shops.suspendPublishingHint")}
                      onConfirm={(reason) => setShopPublishing(supabase, shop.id, true, reason)}
                      onDone={load}
                    />
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 0 && <Pager page={page} total={rows[0].total} onPage={setPage} />}
    </section>
  );
}

const REVIEW_FILTERS = ["published", "hidden", "all"] as const;

function ReviewsPanel() {
  const t = useTranslations("moderation");
  const [filter, setFilter] = useState<string>("published");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReviewForModeration[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listReviewsForModeration(getSupabaseBrowserClient(), filter, search, page, MODERATION_PAGE_SIZE);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as ReviewForModeration[]);
  }, [filter, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const supabase = getSupabaseBrowserClient();
  return (
    <section aria-labelledby="moderation-reviews" className="grid gap-3">
      <h2 id="moderation-reviews" className={headingClass}>{t("reviews.title")}</h2>
      <div className={cardClass}>
        <SearchBar
          id="reviews"
          filters={REVIEW_FILTERS}
          filter={filter}
          label={(name) => t(`reviews.filters.${name}`)}
          onFilter={(next) => { setFilter(next); setPage(1); }}
          onSearch={(next) => { setSearch(next); setPage(1); }}
        />
      </div>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((review) => (
            <li key={review.id}>
              <article aria-label={t("reviews.about", { product: review.product_name })} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{review.product_name}</h3>
                    <p className="break-words text-sm text-muted-foreground">
                      {t("reviews.by", { name: review.author_name ?? review.author_email ?? "" })} · {review.seller_name} · {t("reviews.rating", { rating: review.rating })}
                    </p>
                  </div>
                  <StatusPill tone={review.status === "published" ? "good" : "bad"}>{t(`reviews.status.${review.status}`)}</StatusPill>
                </div>
                {review.body && <p className="mt-2 whitespace-pre-line break-words text-sm">{review.body}</p>}
                {review.hidden_reason && <p className="mt-2 break-words text-sm text-muted-foreground">{t("reviews.hiddenBecause", { reason: review.hidden_reason })}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {review.status === "published" ? (
                    <ReasonAction
                      id={`hide-${review.id}`}
                      label={t("reviews.hide")}
                      destructive
                      hint={t("reviews.hideHint")}
                      onConfirm={(reason) => setReviewHidden(supabase, review.id, true, reason)}
                      onDone={load}
                    />
                  ) : (
                    <ReasonAction
                      id={`show-${review.id}`}
                      label={t("reviews.show")}
                      onConfirm={(reason) => setReviewHidden(supabase, review.id, false, reason)}
                      onDone={load}
                    />
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 0 && <Pager page={page} total={rows[0].total} onPage={setPage} />}
    </section>
  );
}

function useModerationAccess(userId: string | undefined) {
  const [access, setAccess] = useState<ModerationAccess | null>(null);
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(async () => setAccess(await getModerationAccess(getSupabaseBrowserClient())), 0);
    return () => clearTimeout(timer);
  }, [userId]);
  return access;
}

/** Only appears for people with a moderation permission, on their account page. */
export function ModerationLink({ className, children }: { className?: string; children: ReactNode }) {
  const user = useSessionUser();
  const access = useModerationAccess(user?.id);
  if (!access || !hasAnyAccess(access)) return null;
  return <Link href="/admin/moderation" className={className}>{children}</Link>;
}

/**
 * Checking access here only decides what this screen shows. The protection is in
 * the database, which refuses to list or change anything for anyone else.
 */
export function ModerationScreen() {
  const t = useTranslations("admin");
  const user = useSessionUser();
  const access = useModerationAccess(user?.id);

  if (user === undefined || (user && !access)) return <Skeleton className="h-64 rounded-3xl" />;
  if (!user || !access || !hasAnyAccess(access)) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className="font-heading text-xl font-extrabold">{t("noAccessTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{user ? t("noModerationAccess") : t("signInBody")}</p>
        <Link href={user ? "/account" : "/sign-in"} className={cn(primaryButton, "mt-5")}>
          {user ? t("backToAccount") : t("signIn")}
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      {access.products && <ProductsPanel />}
      {access.products && <ReviewsPanel />}
      {(access.shops || access.publishing) && <ShopsPanel access={access} />}
    </div>
  );
}
