import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountDashboard } from "@/components/account/account-dashboard";
import { Suspense } from "react";
import { DashboardDiscover, DashboardDiscoverSkeleton } from "@/components/dashboard/dashboard-discover";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { PageTransition } from "@/components/layout/page-transition";

export async function generateMetadata({ params }: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

// The Overview ends with live ads and blog posts, as the owner asked (2026-11-08).
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "account" });

  return (
    <PageTransition>
      <div className="grid gap-8 px-1 py-2">
        <h1 className="sr-only">{t("title")}</h1>
        <DashboardOverview />
        <section aria-labelledby="account-details" className="grid gap-4">
          <h2 id="account-details" className="px-1 font-heading text-xl font-bold">{t("detailsTitle")}</h2>
          <AccountDashboard />
        </section>
        <Suspense fallback={<DashboardDiscoverSkeleton />}>
          <DashboardDiscover locale={locale} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
