"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cardClass, headingClass, primaryButton } from "@/components/account/account-dashboard";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted";

/** The addresses a seller gives their own website's developer (PRD §10). */
export function shopApiUrl(siteUrl: string, slug: string, what: "products" | "reviews" = "products") {
  return `${siteUrl.replace(/\/$/, "")}/api/v1/sellers/${encodeURIComponent(slug)}/${what}`;
}

function Address({ id, url, what }: { id: string; url: string; what: "products" | "reviews" }) {
  const t = useTranslations("shopApi");
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
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">{t(`${what}.address`)}</label>
      <input
        id={id}
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-muted/40 px-3 font-mono text-xs sm:text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} aria-label={t(`${what}.copy`)} className={primaryButton}>{t("copy")}</button>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={t(`${what}.open`)} className={secondaryButton}>{t("open")}</a>
      </div>
      <p role="status" className="min-h-5 text-sm">{copied === "yes" ? t("copied") : copied === "no" ? t("copyFailed") : null}</p>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{t("forDeveloper")}</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
          {(["what", "options", "links", "limits"] as const).map((note) => (
            <li key={note}>{t(`${what}.developer.${note}`)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function ShopApi({ slug }: { slug: string }) {
  const t = useTranslations("shopApi");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window === "undefined" ? "" : window.location.origin);

  return (
    <section aria-labelledby="shop-api" className={cardClass}>
      <h2 id="shop-api" className={headingClass}>{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      <div className="mt-4 grid gap-6">
        <Address id="shop-api-url" url={shopApiUrl(site, slug, "products")} what="products" />
        <Address id="shop-api-reviews-url" url={shopApiUrl(site, slug, "reviews")} what="reviews" />
      </div>
    </section>
  );
}
