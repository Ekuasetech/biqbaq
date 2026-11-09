import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CATEGORY_SLUGS } from "@/modules/product-catalog";
import { reveal } from "./reveal";

/** `showAbout` adds the About us link, once Super Admin has published that page. */
export function SiteFooter({ showAbout = false }: { showAbout?: boolean }) {
  const t = useTranslations();
  const linkClass = "text-sm text-white/75 transition-colors hover:text-white";

  return (
    <footer className="mt-20 overflow-hidden bg-gradient-to-b from-brand-navy to-[oklch(0.17_0.06_262)] text-white">
      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-[2fr_1fr_1fr]">
          <p {...reveal("rise")} className="max-w-sm text-xl font-semibold text-balance">
            {t("footer.tagline")}
          </p>
          <nav {...reveal("rise", 100)} aria-label={t("footer.shop")}>
            <h2 className="mb-3 text-xs font-bold tracking-widest uppercase">{t("footer.shop")}</h2>
            <ul className="grid gap-2">
              {CATEGORY_SLUGS.map((slug) => (
                <li key={slug}>
                  <Link href={{ pathname: "/products", query: { category: slug } }} className={linkClass}>
                    {t(`categories.${slug}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav {...reveal("rise", 200)} aria-label={t("footer.explore")}>
            <h2 className="mb-3 text-xs font-bold tracking-widest uppercase">{t("footer.explore")}</h2>
            <ul className="grid gap-2">
              <li>
                <Link href="/products" className={linkClass}>
                  {t("nav.products")}
                </Link>
              </li>
              <li>
                <Link href="/cargo-cars" className={linkClass}>
                  {t("cargoCars.title")}
                </Link>
              </li>
              {showAbout && (
                <li>
                  <Link href="/about" className={linkClass}>
                    {t("about.title")}
                  </Link>
                </li>
              )}
              <li>
                <Link href="/blog" className={linkClass}>
                  {t("blog.pageTitle")}
                </Link>
              </li>
              <li>
                <Link href="/conditions-of-use" className={linkClass}>
                  {t("legal.conditionsLink")}
                </Link>
              </li>
              <li>
                <Link href="/privacy-notice" className={linkClass}>
                  {t("legal.privacyLink")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <p {...reveal("rise", 150)} aria-hidden className="pointer-events-none mt-14 pb-[0.2em] text-center font-heading text-[25vw] leading-[0.95] font-extrabold tracking-tighter select-none xl:text-[21rem]">
          biqbaq
        </p>
      </div>
    </footer>
  );
}
