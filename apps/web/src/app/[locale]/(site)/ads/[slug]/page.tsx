import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { destinationKind, getLiveAdBySlug, listAdSlugs } from "@/modules/advertising";

type Props = PageProps<"/[locale]/ads/[slug]">;

// Opts out of instant-navigation validation, like the single product page.
export const instant = false;

export async function generateStaticParams() {
  const slugs = await listAdSlugs();
  // The framework refuses to build a route with no pages, as when no ad is live.
  const paths = slugs.length > 0 ? slugs : ["__none__"];
  return routing.locales.flatMap((locale) => paths.map((slug) => ({ locale, slug })));
}

// A generic title, so a finished or unpublished ad's title can never appear here.
// Ad pages are promotional, so they are kept out of search results.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ads" });
  return { title: t("sectionTitle"), robots: { index: false } };
}

const ctaClass =
  "mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-red px-6 text-sm font-bold text-brand-red-foreground transition-colors hover:bg-primary hover:text-primary-foreground";

/** Reads the time per request, so an ad's page closes as soon as its schedule ends. */
async function AdContent({ locale, slug }: { locale: string; slug: string }) {
  await connection();
  const ad = await getLiveAdBySlug(slug, new Date());
  if (!ad) notFound();

  const t = await getTranslations({ locale, namespace: "ads" });
  const kind = destinationKind(ad.destinationUrl);

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-[3/2] overflow-hidden rounded-3xl bg-muted">
          <Image src={ad.imageUrl} alt="" fill preload sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="flex flex-col items-start justify-center rounded-3xl bg-card p-6 shadow-sm sm:p-10">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
            {t("label")}
          </span>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">{ad.advertiser}</p>
          <h1 className="mt-1 font-heading text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">
            {ad.title}
          </h1>
          <p className="mt-3 whitespace-pre-line break-words leading-relaxed text-muted-foreground">{ad.description}</p>
          {kind === "internal" && (
            <Link href={ad.destinationUrl} className={ctaClass}>
              {t("visit")}
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          )}
          {kind === "external" && (
            <a href={ad.destinationUrl} target="_blank" rel="sponsored noopener noreferrer" className={ctaClass}>
              {t("visit")}
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          )}
          <p className="mt-5 text-xs text-muted-foreground">{t("disclosure")}</p>
        </div>
      </div>
      <SiteExtras locale={locale} excludeAd={ad.slug} />
    </>
  );
}

export default async function AdPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
          <AdContent locale={locale} slug={slug} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
