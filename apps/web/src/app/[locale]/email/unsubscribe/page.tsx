import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ListLinkPage } from "@/components/email-lists/list-link-page";
import { PageTransition } from "@/components/layout/page-transition";

export async function generateMetadata({ params }: PageProps<"/[locale]/email/unsubscribe">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "emailLink" });
  return { title: t("unsubscribe.title"), robots: { index: false } };
}

export default async function EmailLinkPage({ params }: PageProps<"/[locale]/email/unsubscribe">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "emailLink" });
  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-5 text-center font-heading text-3xl font-extrabold tracking-tight">{t("unsubscribe.title")}</h1>
        {/* It reads the link's token, which is only known in the browser. */}
        <Suspense fallback={null}>
          <ListLinkPage action="unsubscribe" />
        </Suspense>
      </div>
    </PageTransition>
  );
}
