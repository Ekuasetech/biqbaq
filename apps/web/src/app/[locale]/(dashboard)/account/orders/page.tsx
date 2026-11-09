import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageTransition } from "@/components/layout/page-transition";
import { MyOrders } from "@/components/payments/my-orders";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payments.myOrders" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MyOrdersPage({ params }: PageProps<"/[locale]/account/orders">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "payments.myOrders" });
  return (
    <PageTransition>
      <div className="grid gap-5 px-1 py-2">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("title")}</h1>
        <MyOrders />
      </div>
    </PageTransition>
  );
}
