import { Eye, MapPin, Package } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import { ProductGrid } from "@/components/product/product-card";
import { SellerBadge } from "@/components/product/seller-badge";
import { routing } from "@/i18n/routing";
import { getSellerBySlug, listProductsBySeller, listSellers } from "@/modules/product-catalog";

type Props = PageProps<"/[locale]/sellers/[slug]">;

// Opts out of instant-navigation validation, like the single product page.
export const instant = false;

export async function generateStaticParams() {
  const sellers = await listSellers();
  return routing.locales.flatMap((locale) => sellers.map((seller) => ({ locale, slug: seller.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) return {};
  return { title: seller.name, description: seller.description };
}

export default async function SellerPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const seller = await getSellerBySlug(slug);
  if (!seller) notFound();

  const t = await getTranslations({ locale });
  const products = await listProductsBySeller(slug);
  const views = products.reduce((total, product) => total + product.views, 0);

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="flex flex-col gap-5 rounded-3xl bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
          <span
            aria-hidden
            className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-brand-navy font-heading text-3xl font-extrabold text-white"
          >
            {seller.name.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{seller.name}</h1>
            <SellerBadge verified={seller.verified} className="mt-1" />
            <p className="mt-2 max-w-2xl text-muted-foreground">{seller.description}</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <li className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-muted-foreground" aria-hidden />
                {t("seller.location", { city: seller.city, country: t(`markets.${seller.country}`) })}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Package className="size-4 text-muted-foreground" aria-hidden />
                {t("seller.productCount", { count: products.length })}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Eye className="size-4 text-muted-foreground" aria-hidden />
                {t("common.views", { count: views })}
              </li>
            </ul>
          </div>
        </section>

        <section className="pt-10" aria-labelledby="seller-products-title">
          <h2 id="seller-products-title" className="mb-5 font-heading text-2xl font-extrabold tracking-tight">
            {t("seller.productsTitle")}
          </h2>
          <ProductGrid products={products} />
        </section>

        <SiteExtras locale={locale} />
      </div>
    </PageTransition>
  );
}
