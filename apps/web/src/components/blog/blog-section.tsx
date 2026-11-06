import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { reveal, RevealWords } from "@/components/layout/reveal";
import { Link } from "@/i18n/navigation";
import { listPopularBlogPosts } from "@/modules/blog";
import { BlogFeaturedCard, BlogListItem } from "./blog-post-card";

export async function BlogSection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale });
  const [leadPost, ...otherPosts] = await listPopularBlogPosts(5);
  if (!leadPost) return null;

  return (
    <section className="pt-14" aria-labelledby="blog-title">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id="blog-title" className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          <RevealWords text={t("blog.sectionTitle")} />
        </h2>
        <Link
          {...reveal("rise", 150)}
          href="/blog"
          className="flex shrink-0 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
        >
          {t("home.viewAll")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div {...reveal("rise")}>
          <BlogFeaturedCard post={leadPost} />
        </div>
        <ul className="grid gap-3">
          {otherPosts.map((post, index) => (
            <li key={post.id} {...reveal("rise", 100 + index * 90)}>
              <BlogListItem post={post} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
