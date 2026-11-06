import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthPage } from "@/components/auth/auth-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("forgotTitle") };
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <AuthPage
      locale={locale}
      title={t("auth.forgotTitle")}
      subtitle={t("auth.forgotSubtitle")}
      image="/hero/toronto-professional.jpg"
      imageAlt={t("home.slideTorontoAlt")}
    >
      <ForgotPasswordForm />
    </AuthPage>
  );
}
