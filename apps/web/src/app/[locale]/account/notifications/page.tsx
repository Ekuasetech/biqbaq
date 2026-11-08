import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageTransition } from "@/components/layout/page-transition";
import { NotificationCentre } from "@/components/notifications/notification-centre";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/notifications">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "notifications" });
  return { title: t("title"), robots: { index: false } };
}

// A private page, so it has no ads or blog: ads are for the public site (PRD §12).
export default async function NotificationsPage({ params }: PageProps<"/[locale]/account/notifications">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "notifications" });

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-5 font-heading text-3xl font-extrabold tracking-tight">{t("title")}</h1>
        <NotificationCentre />
      </div>
    </PageTransition>
  );
}
