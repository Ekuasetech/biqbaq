import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReferralsAdmin } from "@/components/admin/referrals-admin";
import { PageTransition } from "@/components/layout/page-transition";

type Props = PageProps<"/[locale]/admin/referrals">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "referralsAdmin" });
  return { title: t("title"), robots: { index: false } };
}

// A private page, so it has no ads or blog: ads are for the public site (PRD §12).
export default async function ReferralsAdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">{t("admin.section")}</p>
        <h1 className="mb-5 font-heading text-3xl font-extrabold tracking-tight">{t("referralsAdmin.title")}</h1>
        <ReferralsAdmin />
      </div>
    </PageTransition>
  );
}
