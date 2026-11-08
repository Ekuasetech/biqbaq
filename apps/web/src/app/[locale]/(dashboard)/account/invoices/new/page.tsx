import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { InvoiceForm } from "@/components/invoicing/invoice-form";
import { PageTransition } from "@/components/layout/page-transition";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/invoices/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "invoices" });
  return { title: t("title"), robots: { index: false } };
}

// A private page, so it has no ads or blog: ads are for the public site (PRD §12).
export default async function NewInvoicePage({ params }: PageProps<"/[locale]/account/invoices/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "invoices" });
  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="mb-5 font-heading text-3xl font-extrabold tracking-tight">{t("title")}</h1>
        {/* It reads the address's query, which is only known in the browser. */}
        <Suspense fallback={<Skeleton className="h-96 rounded-3xl" aria-hidden />}>
          <InvoiceForm />
        </Suspense>
      </div>
    </PageTransition>
  );
}
