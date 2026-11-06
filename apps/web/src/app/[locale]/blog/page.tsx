import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BlogFeaturedCard, BlogListItem } from "@/components/blog/blog-post-card";
import { PageTransition } from "@/components/layout/page-transition";
import { reveal } from "@/components/layout/reveal";
import { SiteAds } from "@/components/layout/site-extras";
import { listPopularBlogPosts } from "@/modules/blog";

export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  return { title: t("pageTitle"), description: t("pageBody") };
}

// Lists sample articles until the blog is built (Phase 6). The ads are shown on
// their own, as the blog section would only repeat this list.
export default async function BlogPage({ params }: PageProps<"/[locale]/blog">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  const [leadPost, ...otherPosts] = await listPopularBlogPosts();

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 {...reveal("rise")} className="font-heading text-3xl font-extrabold tracking-tight">
          {t("pageTitle")}
        </h1>
        <p {...reveal("rise", 100)} className="mt-2 mb-6 max-w-2xl text-muted-foreground">
          {t("pageBody")}
        </p>
        {leadPost && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div {...reveal("rise", 150)}>
              <BlogFeaturedCard post={leadPost} />
            </div>
            <ul aria-label={t("allArticles")} className="grid gap-3">
              {otherPosts.map((post, index) => (
                <li key={post.id} {...reveal("rise", 200 + index * 90)}>
                  <BlogListItem post={post} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <SiteAds locale={locale} />
      </div>
    </PageTransition>
  );
}
