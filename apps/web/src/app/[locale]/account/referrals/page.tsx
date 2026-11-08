import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageTransition } from "@/components/layout/page-transition";
import { ReferralDashboard } from "@/components/referrals/referral-dashboard";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/referrals">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "referrals" });
  return { title: t("title"), robots: { index: false } };
}

// A private page, so it has no ads or blog: ads are for the public site (PRD §12).
export default async function ReferralsPage({ params }: PageProps<"/[locale]/account/referrals">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "referrals" });

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="mb-5 font-heading text-3xl font-extrabold tracking-tight">{t("title")}</h1>
        <ReferralDashboard />
      </div>
    </PageTransition>
  );
}
