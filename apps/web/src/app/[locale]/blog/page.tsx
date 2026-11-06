import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteExtras } from "@/components/layout/site-extras";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  return { title: t("pageTitle") };
}

// Placeholder until the blog is built (Phase 6).
export default async function BlogPage({ params }: PageProps<"/[locale]/blog">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "blog" });

  return (
    <>
      <div className="mx-auto max-w-xl px-4 pt-20 text-center">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("pageTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("pageBody")}</p>
      <Link
        href="/products"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-brand-red hover:text-brand-red-foreground"
      >
        {t("browse")}
      </Link>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SiteExtras locale={locale} />
      </div>
    </>
  );
}
