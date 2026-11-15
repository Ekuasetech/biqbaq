import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/legal/legal-page";
import { getLegalDocument } from "@/content/legal";

type Props = PageProps<"/[locale]/conditions-of-use">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getLegalDocument(locale, "conditions").title };
}

export default async function ConditionsOfUsePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} document={getLegalDocument(locale, "conditions")} />;
}
