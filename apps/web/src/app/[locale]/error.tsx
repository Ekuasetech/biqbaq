"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Shown when a page can't load its data, such as during a database outage. */
export default function ErrorPage({ retry }: { retry: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("body")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground outline-none hover:bg-brand-red hover:text-brand-red-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("retry")}
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-bold outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring">
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
