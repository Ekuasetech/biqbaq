import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthPage } from "@/components/auth/auth-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signInTitle") };
}

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <AuthPage
      locale={locale}
      title={t("auth.signInTitle")}
      subtitle={t("auth.signInSubtitle")}
      image="/hero/toronto-professional.jpg"
      imageAlt={t("home.slideTorontoAlt")}
    >
      <SignInForm />
    </AuthPage>
  );
}
