import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { Advertisement } from "@/modules/advertising";

/** One ad, as it appears in a Sponsored section. Used for the site and for previews. */
export function AdCard({ ad, large, preview }: { ad: Pick<Advertisement, "slug" | "title" | "advertiser" | "imageUrl">; large?: boolean; preview?: boolean }) {
  const t = useTranslations("ads");
  return (
    <article className="group relative isolate flex h-72 flex-col justify-end overflow-hidden rounded-3xl bg-brand-navy p-5 text-white shadow-sm">
      {ad.imageUrl && (
        <Image
          src={ad.imageUrl}
          alt=""
          fill
          sizes={large ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw"}
          className="-z-20 object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none"
        />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/10" />
      <span className="absolute top-4 left-4 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-navy">{t("label")}</span>
      <p className="text-xs font-semibold text-white/85">{ad.advertiser}</p>
      <h3 className="mt-1 font-heading text-xl leading-tight font-extrabold text-balance">
        {preview ? ad.title : (
          <Link href={`/ads/${ad.slug}`} className="outline-none after:absolute after:inset-0">{ad.title}</Link>
        )}
      </h3>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold group-hover:underline">
        {t("learnMore")}
        <ArrowUpRight className="size-4" aria-hidden />
      </span>
    </article>
  );
}
