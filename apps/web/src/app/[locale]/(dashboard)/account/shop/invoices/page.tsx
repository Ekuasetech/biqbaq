import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { MyShop } from "@/components/seller/my-shop";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/shop/invoices">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  return { title: t("sections.invoices.title"), robots: { index: false } };
}

export default async function ShopSectionPage({ params }: PageProps<"/[locale]/account/shop/invoices">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "shop" });

  return (
    <PageTransition>
      <div className="grid gap-5 px-1 py-2">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("sections.invoices.title")}</h1>
        {/* It reads the address's query, which is only known in the browser. */}
        <Suspense fallback={<Skeleton className="h-64 rounded-3xl" aria-hidden />}>
          <MyShop section="invoices" />
        </Suspense>
      </div>
    </PageTransition>
  );
}
