import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PostStats, WriterAvatar } from "@/components/blog/blog-post-card";
import { PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import { ShareButtons } from "@/components/product/share-buttons";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getBlogPostBySlug, listBlogPostSlugs } from "@/modules/blog";

type Props = PageProps<"/[locale]/blog/[slug]">;

// Opts out of instant-navigation validation, like the single product page.
export const instant = false;

export async function generateStaticParams() {
  const slugs = await listBlogPostSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const t = await getTranslations({ locale, namespace: "blog" });
  const published = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(post.publishedAt));

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <article className="mx-auto max-w-3xl">
          <nav aria-label={t("breadcrumbLabel")} className="mb-4 text-sm text-muted-foreground">
            <Link href="/blog" className="hover:text-foreground">
              {t("pageTitle")}
            </Link>
          </nav>
          <p className="text-xs font-bold tracking-wide text-brand-red uppercase dark:text-red-400">
            {t(`topics.${post.topic}`)}
          </p>
          <h1 className="mt-2 font-heading text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-semibold text-foreground">
              <WriterAvatar name={post.writer} />
              {post.writer}
            </span>
            <span>{published}</span>
            <PostStats post={post} />
          </div>
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-3xl bg-muted">
            <Image src={post.imageUrl} alt="" fill preload sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
          </div>
          <p className="mt-6 text-lg font-medium">{post.excerpt}</p>
          {post.body.map((paragraph) => (
            <p key={paragraph} className="mt-4 leading-relaxed">
              {paragraph}
            </p>
          ))}
          <div className="mt-8">
            <ShareButtons title={post.title} />
          </div>
        </article>
        <SiteExtras locale={locale} excludePost={post.slug} />
      </div>
    </PageTransition>
  );
}
