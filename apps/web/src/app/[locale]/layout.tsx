import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { REVEAL_BOOT_SCRIPT, RevealObserver } from "@/components/layout/reveal-observer";
import { ReferralCapture } from "@/components/referrals/referral-capture";
import { ThemeProvider } from "@/components/theme-provider";
import { routing } from "@/i18n/routing";
import "../globals.css";

const brandFont = Plus_Jakarta_Sans({
  variable: "--font-brand",
  subsets: ["latin", "latin-ext"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: t("title"), template: "%s | Biqbaq" },
    description: t("description"),
    // The logo in the browser tab, and the iPhone's home-screen icon (Q-61). Set here in full,
    // since setting icons here replaces the app folder's own icon file.
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "48x48" },
        { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
    appleWebApp: { capable: true, title: "Biqbaq", statusBarStyle: "default" },
  };
}

/** The phone's browser bar takes Biqbaq's navy. */
export const viewport: Viewport = { themeColor: "#0c2352" };

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <html lang={locale} suppressHydrationWarning className={`${brandFont.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <RevealObserver />
          <ReferralCapture />
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <a
              href="#main"
              className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
            >
              {t("skipToContent")}
            </a>
            <p className="bg-brand-navy px-4 py-2 text-center text-xs font-medium text-white">
              {t("previewNotice")}
            </p>
            {/* The public site adds its header and footer; dashboards add their sidebar. */}
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
