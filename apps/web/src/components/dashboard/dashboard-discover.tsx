import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { listLiveAds } from "@/modules/advertising";
import { listPopularBlogPosts } from "@/modules/blog";

export function DashboardDiscoverSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-hidden>
      {[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-48 rounded-2xl" />)}
    </div>
  );
}

function Thumbnail({ href, image, label, title, detail }: { href: string; image: string; label: string; title: string; detail: string }) {
  return (
    <li>
      <Link href={href} prefetch={false} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-transform hover:-translate-y-0.5">
        <span className="relative block aspect-[16/10] overflow-hidden bg-muted">
          <Image src={image} alt="" fill sizes="(min-width: 1280px) 20vw, 45vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
          <span className="absolute top-2 left-2 rounded-full bg-brand-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">{label}</span>
        </span>
        <span className="grid gap-0.5 p-3">
          <span className="line-clamp-2 text-sm font-semibold">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Live ads and the most read blog posts at the bottom of everyone's Overview (owner's
 * decision, 2026-11-08). The same ones the public site shows, so nothing new is exposed.
 */
export async function DashboardDiscover({ locale }: { locale: string }) {
  await connection();
  const t = await getTranslations({ locale, namespace: "dashboard.discover" });
  const [ads, posts] = await Promise.all([listLiveAds("global", new Date(), 4), listPopularBlogPosts(4)]);
  if (ads.length === 0 && posts.length === 0) return null;

  return (
    <div className="grid gap-6">
      {ads.length > 0 && (
        <section aria-labelledby="dashboard-ads" className="grid gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 id="dashboard-ads" className="font-heading text-lg font-bold">{t("ads")}</h2>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {ads.map((ad) => (
              <Thumbnail key={ad.id} href={`/ads/${ad.slug}`} image={ad.imageUrl} label={t("sponsored")} title={ad.title} detail={ad.advertiser} />
            ))}
          </ul>
        </section>
      )}
      {posts.length > 0 && (
        <section aria-labelledby="dashboard-blog" className="grid gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 id="dashboard-blog" className="font-heading text-lg font-bold">{t("blog")}</h2>
            <Link href="/blog" prefetch={false} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">{t("allPosts")}</Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {posts.map((post) => (
              <Thumbnail
                key={post.id}
                href={`/blog/${post.slug}`}
                image={post.imageUrl}
                label={locale === "fr" ? post.topicNames.fr : post.topicNames.en}
                title={post.title}
                detail={t("minutes", { count: post.readMinutes })}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
