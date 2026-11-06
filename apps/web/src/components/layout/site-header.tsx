import { LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { SearchForm } from "./search-form";
import { ThemeToggle } from "./theme-toggle";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    // The navy logo needs a light backing to stay visible in dark mode.
    <span className="inline-flex rounded-lg bg-white p-0.5">
      <Image src="/biqbaq.png" alt="" width={size} height={Math.round((size * 472) / 506)} preload />
    </span>
  );
}

export function SiteHeader() {
  const t = useTranslations("nav");

  return (
    <header
      data-rv="rise"
      suppressHydrationWarning
      style={{ viewTransitionName: "site-header" }}
      className="sticky top-0 z-40 bg-background/90 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg font-heading text-xl font-extrabold tracking-tight">
          <BrandMark />
          Biqbaq
        </Link>
        <nav aria-label={t("mainLabel")} className="hidden sm:ml-3 sm:block">
          <Link
            href="/products"
            className="flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-sm transition-colors hover:text-brand-red"
          >
            <LayoutGrid className="size-4" aria-hidden />
            {t("allCategories")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:order-last sm:ml-0">
          <Link
            href="/sign-in"
            className="flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold transition-colors hover:text-brand-red"
          >
            {t("signIn")}
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
        <SearchForm id="header-search" className="order-last w-full sm:order-none sm:flex-1" />
      </div>
    </header>
  );
}
