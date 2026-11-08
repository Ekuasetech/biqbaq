import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { AdCard } from "@/components/advertising/ad-card";
import { reveal, RevealWords } from "@/components/layout/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listLiveAds, type AdPlacement } from "@/modules/advertising";

export function AdsSkeleton() {
  return (
    <div className="grid gap-4 pt-14 md:grid-cols-4">
      <Skeleton className="h-72 rounded-3xl md:col-span-2" />
      <Skeleton className="h-72 rounded-3xl" />
      <Skeleton className="h-72 rounded-3xl" />
    </div>
  );
}

/** Live ads for a placement. Reads the time per request, so schedules apply as they pass. */
export async function AdsSection({
  locale,
  placement,
  excludeSlug,
}: {
  locale: string;
  placement: AdPlacement;
  excludeSlug?: string;
}) {
  await connection();
  const t = await getTranslations({ locale, namespace: "ads" });
  const ads = await listLiveAds(placement, new Date(), undefined, excludeSlug);
  if (ads.length === 0) return null;

  return (
    <section className="pt-14" aria-labelledby="ads-title">
      <h2 id="ads-title" className="mb-5 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
        <RevealWords text={t("sectionTitle")} />
      </h2>
      <ul className="grid gap-4 md:grid-cols-4">
        {ads.map((ad, index) => (
          <li key={ad.id} {...reveal("rise", index * 90)} className={cn(index === 0 && "md:col-span-2")}>
            <AdCard ad={ad} large={index === 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}
