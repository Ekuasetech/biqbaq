import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegisterForm } from "@/components/auth/auth-forms";
import { AuthPage } from "@/components/auth/auth-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/register">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("registerTitle") };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <AuthPage
      locale={locale}
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      image="/hero/nigeria-seller.jpg"
      imageAlt={t("home.slideSellerAlt")}
      imagePosition="object-[65%_center]"
    >
      <RegisterForm />
    </AuthPage>
  );
}
