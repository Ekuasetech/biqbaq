import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { SiteExtras } from "@/components/layout/site-extras";
import { ProductGrid } from "@/components/product/product-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname, Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  CATEGORY_SLUGS,
  listProducts,
  parseProductQuery,
  type ProductQuery,
} from "@/modules/product-catalog";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "products" });
  return { title: t("title") };
}

function toHref(query: ProductQuery, changes: Partial<ProductQuery>) {
  const { q, category, market, sort, page } = { ...query, ...changes };
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (category) params.category = category;
  if (market) params.market = market;
  if (sort !== "newest") params.sort = sort;
  if (page > 1) params.page = String(page);
  return { pathname: "/products", query: params };
}

async function Results({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/products">["searchParams"];
}) {
  const t = await getTranslations({ locale });
  const query = parseProductQuery(await searchParams);
  const { data, meta } = await listProducts(query);
  const hasFilters = Boolean(query.q || query.category || query.market);
  const selectClass =
    "h-10 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const chipClass = (active: boolean) =>
    cn(
      "inline-block rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary",
    );

  return (
    <>
      <nav aria-label={t("products.categoriesLabel")} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 pb-1">
          <li className="shrink-0">
            <Link
              href={toHref(query, { category: undefined, page: 1 })}
              aria-current={!query.category ? "page" : undefined}
              className={chipClass(!query.category)}
            >
              {t("products.allCategories")}
            </Link>
          </li>
          {CATEGORY_SLUGS.map((slug) => (
            <li key={slug} className="shrink-0">
              <Link
                href={toHref(query, { category: slug, page: 1 })}
                aria-current={query.category === slug ? "page" : undefined}
                className={chipClass(query.category === slug)}
              >
                {t(`categories.${slug}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("products.resultCount", { count: meta.total })}
          {query.q && <> · {t("products.resultsFor", { query: query.q })}</>}
        </p>
        <form action={getPathname({ href: "/products", locale })} className="flex flex-wrap items-end gap-3">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.category && <input type="hidden" name="category" value={query.category} />}
          <label className="grid gap-1 text-xs font-medium">
            {t("products.sort")}
            <select name="sort" defaultValue={query.sort} className={selectClass}>
              <option value="newest">{t("products.sortNewest")}</option>
              <option value="price_asc">{t("products.sortPriceAsc")}</option>
              <option value="price_desc">{t("products.sortPriceDesc")}</option>
              <option value="name">{t("products.sortName")}</option>
            </select>
          </label>
          <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
            {t("products.apply")}
          </button>
        </form>
      </div>

      <div className="mt-5">
        {data.length > 0 ? (
          <ProductGrid products={data} />
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">{t("products.emptyTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("products.emptyBody")}</p>
            {hasFilters && (
              <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-4 h-10")}>
                {t("products.clearFilters")}
              </Link>
            )}
          </div>
        )}
      </div>

      {meta.totalPages > 1 && (
        <nav aria-label={t("products.paginationLabel")} className="mt-8 flex items-center justify-center gap-3">
          {meta.page > 1 && (
            <Link href={toHref(query, { page: meta.page - 1 })} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
              {t("products.previous")}
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            {t("products.pageOf", { page: meta.page, total: meta.totalPages })}
          </span>
          {meta.page < meta.totalPages && (
            <Link href={toHref(query, { page: meta.page + 1 })} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
              {t("products.next")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
      ))}
    </div>
  );
}

export default async function ProductsPage({ params, searchParams }: PageProps<"/[locale]/products">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "products" });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-5 font-heading text-3xl font-extrabold tracking-tight">{t("title")}</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results locale={locale} searchParams={searchParams} />
      </Suspense>
      <SiteExtras locale={locale} />
    </div>
  );
}
