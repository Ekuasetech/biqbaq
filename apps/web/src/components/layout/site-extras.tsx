import { Suspense } from "react";
import { AdsSection, AdsSkeleton } from "@/components/advertising/ads-section";
import { BlogSection } from "@/components/blog/blog-section";

/** The blog and ads shown at the end of every page other than the home page. */
export function SiteExtras({
  locale,
  excludePost,
  excludeAd,
}: {
  locale: string;
  excludePost?: string;
  excludeAd?: string;
}) {
  return (
    <>
      <BlogSection locale={locale} excludeSlug={excludePost} />
      <SiteAds locale={locale} excludeAd={excludeAd} />
    </>
  );
}

export function SiteAds({ locale, excludeAd }: { locale: string; excludeAd?: string }) {
  return (
    <Suspense fallback={<AdsSkeleton />}>
      <AdsSection locale={locale} placement="global" excludeSlug={excludeAd} />
    </Suspense>
  );
}
