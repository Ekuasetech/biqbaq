import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { reveal, RevealWords } from "@/components/layout/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { listLiveAds, type Advertisement, type AdPlacement } from "@/modules/advertising";

function AdLink({ ad, children }: { ad: Advertisement; children: ReactNode }) {
  const className = "outline-none after:absolute after:inset-0";
  return ad.destinationUrl.startsWith("/") ? (
    <Link href={ad.destinationUrl} className={className}>
      {children}
    </Link>
  ) : (
    <a href={ad.destinationUrl} target="_blank" rel="sponsored noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

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
export async function AdsSection({ locale, placement }: { locale: string; placement: AdPlacement }) {
  await connection();
  const t = await getTranslations({ locale, namespace: "ads" });
  const ads = await listLiveAds(placement, new Date(), 3);
  if (ads.length === 0) return null;

  return (
    <section className="pt-14" aria-labelledby="ads-title">
      <h2 id="ads-title" className="mb-5 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
        <RevealWords text={t("sectionTitle")} />
      </h2>
      <ul className="grid gap-4 md:grid-cols-4">
        {ads.map((ad, index) => (
          <li key={ad.id} {...reveal("rise", index * 90)} className={cn(index === 0 && "md:col-span-2")}>
            <article className="group relative isolate flex h-72 flex-col justify-end overflow-hidden rounded-3xl bg-brand-navy p-5 text-white shadow-sm focus-within:ring-2 focus-within:ring-ring">
              <Image
                src={ad.imageUrl}
                alt=""
                fill
                sizes={index === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw"}
                className="-z-20 object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none"
              />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/10" />
              <span className="absolute top-4 left-4 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-navy">
                {t("label")}
              </span>
              <p className="text-xs font-semibold text-white/85">{ad.advertiser}</p>
              <h3 className="mt-1 font-heading text-xl leading-tight font-extrabold text-balance">
                <AdLink ad={ad}>{ad.title}</AdLink>
              </h3>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold group-hover:underline">
                {t("learnMore")}
                <ArrowUpRight className="size-4" aria-hidden />
              </span>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
