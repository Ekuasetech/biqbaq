"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cardClass, headingClass, primaryButton } from "@/components/account/account-dashboard";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted";

/** The address a seller gives their own website's developer (PRD §10). */
export function shopApiUrl(siteUrl: string, slug: string) {
  return `${siteUrl.replace(/\/$/, "")}/api/v1/sellers/${encodeURIComponent(slug)}/products`;
}

export function ShopApi({ slug }: { slug: string }) {
  const t = useTranslations("shopApi");
  const url = shopApiUrl(process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window === "undefined" ? "" : window.location.origin), slug);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      // Some browsers refuse without permission. The address is shown, so it can be selected by hand.
      setCopied("no");
    }
  }

  return (
    <section aria-labelledby="shop-api" className={cardClass}>
      <h2 id="shop-api" className={headingClass}>{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      <div className="mt-4 grid gap-2">
        <label htmlFor="shop-api-url" className="text-sm font-medium">{t("address")}</label>
        <input
          id="shop-api-url"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-muted/40 px-3 font-mono text-xs sm:text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy()} className={primaryButton}>{t("copy")}</button>
          <a href={url} target="_blank" rel="noopener noreferrer" className={secondaryButton}>{t("open")}</a>
        </div>
        <p role="status" className="min-h-5 text-sm">{copied === "yes" ? t("copied") : copied === "no" ? t("copyFailed") : null}</p>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold">{t("forDeveloper")}</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
          <li>{t("developer.what")}</li>
          <li>{t("developer.options")}</li>
          <li>{t("developer.links")}</li>
          <li>{t("developer.limits")}</li>
        </ul>
      </details>
    </section>
  );
}
