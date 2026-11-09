import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AboutAdmin } from "@/components/admin/about-admin";
import { PageTransition } from "@/components/layout/page-transition";

type Props = PageProps<"/[locale]/admin/about">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aboutAdmin" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AboutAdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  return (
    <PageTransition>
      <div className="grid gap-5 px-1 py-2">
        <div>
          <p className="text-sm text-muted-foreground">{t("admin.section")}</p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("aboutAdmin.title")}</h1>
        </div>
        <AboutAdmin />
      </div>
    </PageTransition>
  );
}
