import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SubscribePopup } from "@/components/layout/subscribe-popup";

/** The public site: header, page, footer. */
export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  // Each layout sets the language itself, so its header can be built ahead of time.
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <SubscribePopup />
    </>
  );
}
