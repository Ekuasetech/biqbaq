import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { productPhotoName, PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import { ContactForm } from "@/components/product/contact-form";
import { ProductGrid } from "@/components/product/product-card";
import { FavouriteButton, ReviewForm } from "@/components/product/product-engagement";
import { ProductGallery } from "@/components/product/product-gallery";
import { RatingStars } from "@/components/product/rating-stars";
import { RecordView } from "@/components/product/record-view";
import { SellerBadge } from "@/components/product/seller-badge";
import { ShareButtons } from "@/components/product/share-buttons";
import { ViewCount } from "@/components/product/view-count";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { averageRating, formatPrice } from "@/lib/format";
import { getFeatureFlags, getProductBySlug, listProductSlugs, listRelatedProducts } from "@/modules/product-catalog";

type Props = PageProps<"/[locale]/products/[slug]">;

// Opts out of instant-navigation validation: this page reads its params outside
// Suspense, so it may block on navigation. It does not affect status codes: an
// unknown slug responds 200 with a noindex tag (see implementation-roadmap.md).
export const instant = false;

export async function generateStaticParams() {
  const slugs = await listProductSlugs();
  // The framework refuses to build a route with no pages, as on a new, empty catalogue.
  const paths = slugs.length > 0 ? slugs : ["__none__"];
  return routing.locales.flatMap((locale) => paths.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    // English URLs are the canonical form used by the public seller API.
    alternates: { canonical: getPathname({ href: `/products/${slug}`, locale: routing.defaultLocale }) },
    openGraph: {
      title: product.name,
      description: product.description,
      locale,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const t = await getTranslations({ locale });
  const related = await listRelatedProducts(product, 4);
  const features = await getFeatureFlags();
  const average = averageRating(product.reviews.map((r) => r.rating));
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <PageTransition>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <nav aria-label={t("productDetail.breadcrumbLabel")} className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/products" className="hover:text-foreground">{t("nav.products")}</Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={{ pathname: "/products", query: { category: product.category } }} className="hover:text-foreground">
              {t(`categories.${product.category}`)}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={product.images} photoName={productPhotoName(product.slug)} />

        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-balance">{product.name}</h1>
            {features.reviews && average !== null && (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <RatingStars rating={average} />
                {t("productDetail.ratingSummary", { average, count: product.reviews.length })}
              </p>
            )}
            <p className="mt-3 text-3xl font-bold">{formatPrice(product.price, locale)}</p>
            <p className="mt-1 text-sm font-medium">{t(`availability.${product.availability}`)}</p>
            <ViewCount count={product.views} className="mt-1" />
            <RecordView productId={product.id} />
          </div>

          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{t("seller.soldBy")}</p>
            <p className="font-semibold">
              <Link href={`/sellers/${product.seller.slug}`} className="underline-offset-4 hover:underline">
                {product.seller.name}
              </Link>
            </p>
            <SellerBadge verified={product.seller.verified} className="mt-1" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("seller.basedIn", { city: product.seller.city, country: t(`markets.${product.seller.country}`) })}
            </p>
            <p className="mt-1 text-sm">{product.seller.description}</p>
          </div>

          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">{t("productDetail.description")}</h2>
            <p className="mt-1 text-sm leading-relaxed">{product.description}</p>
            {product.condition && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">{t("productDetail.condition")}:</span> {t(`condition.${product.condition}`)}
              </p>
            )}
          </div>

          {features.favourites && <FavouriteButton productId={product.id} />}

          <ShareButtons title={product.name} />
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="contact-title">
          <h2 id="contact-title" className="font-heading text-2xl font-bold tracking-tight">{t("contact.title")}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("contact.intro")}</p>
          <ContactForm productId={product.id} />
        </section>

        {features.reviews && (
        <section aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="font-heading text-2xl font-bold tracking-tight">{t("productDetail.reviews")}</h2>
          {product.reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("productDetail.noReviews")}</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {product.reviews.map((review) => (
                <li key={review.id} className="rounded-2xl bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <RatingStars rating={review.rating} />
                    <span className="font-semibold">{review.author || t("reviews.anonymous")}</span>
                    {review.verifiedPurchase && (
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {t("productDetail.verifiedPurchase")}
                      </span>
                    )}
                  </div>
                  {review.body && <p className="mt-1 whitespace-pre-line break-words text-sm">{review.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{dateFormat.format(new Date(review.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
          <ReviewForm productId={product.id} />
        </section>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-4 font-heading text-2xl font-bold tracking-tight">{t("productDetail.related")}</h2>
          <ProductGrid products={related} />
        </section>
      )}

      <SiteExtras locale={locale} />
    </div>
    </PageTransition>
  );
}
