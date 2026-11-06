import { Suspense } from "react";
import { AdsSection, AdsSkeleton } from "@/components/advertising/ads-section";
import { BlogSection } from "@/components/blog/blog-section";

/** The blog and ads shown at the end of every page other than the home page. */
export function SiteExtras({ locale }: { locale: string }) {
  return (
    <>
      <BlogSection locale={locale} />
      <Suspense fallback={<AdsSkeleton />}>
        <AdsSection locale={locale} placement="global" />
      </Suspense>
    </>
  );
}
