import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopsOnBehalfScreen } from "@/components/admin/shops-on-behalf";
import { PageTransition } from "@/components/layout/page-transition";

type Props = PageProps<"/[locale]/admin/shops">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shopsAdmin" });
  return { title: t("title"), robots: { index: false } };
}

// Shops an Admin or Co-admin can work on for the seller (PRD §3.4, roadmap item 8).
export default async function ShopsAdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">{t("admin.section")}</p>
        <h1 className="mb-5 font-heading text-3xl font-extrabold tracking-tight">{t("shopsAdmin.title")}</h1>
        <ShopsOnBehalfScreen />
      </div>
    </PageTransition>
  );
}
