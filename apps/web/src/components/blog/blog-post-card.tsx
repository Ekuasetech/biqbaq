import { BookOpen, Clock, Flame } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { BlogPost } from "@/modules/blog";

function WriterAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-bold text-brand-red-foreground",
        className,
      )}
    >
      {name.charAt(0)}
    </span>
  );
}

function PostStats({ post }: { post: BlogPost }) {
  const t = useTranslations("blog");

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <BookOpen className="size-3.5 shrink-0" aria-hidden />
        {t("readers", { count: post.readers })}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {t("readMinutes", { count: post.readMinutes })}
      </span>
    </>
  );
}

/** The large lead article, with its text over the photo. */
export function BlogFeaturedCard({ post }: { post: BlogPost }) {
  const t = useTranslations("blog");
  const format = useFormatter();

  return (
    <article className="group relative isolate flex h-full min-h-96 flex-col justify-end overflow-hidden rounded-3xl bg-brand-navy p-5 text-white shadow-sm focus-within:ring-2 focus-within:ring-ring sm:p-7">
      <Image
        src={post.imageUrl}
        alt=""
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="-z-20 object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/10" />
      <span className="absolute top-4 left-4 inline-flex items-center gap-1 rounded-full bg-brand-red px-3 py-1 text-xs font-bold text-brand-red-foreground sm:top-5 sm:left-5">
        <Flame className="size-3.5" aria-hidden />
        {t("mostRead")}
      </span>
      <p className="text-xs font-bold tracking-widest uppercase">{t(`topics.${post.topic}`)}</p>
      <h3 className="mt-2 font-heading text-2xl leading-tight font-extrabold text-balance sm:text-3xl">
        {/* The link covers the whole card through the ::after overlay. */}
        <Link href="/blog" className="outline-none after:absolute after:inset-0">
          {post.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-2 text-sm text-white/85">{post.excerpt}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/90">
        <span className="inline-flex items-center gap-2 font-semibold">
          <WriterAvatar name={post.writer} />
          {post.writer}
        </span>
        <span>{format.dateTime(new Date(post.publishedAt), { dateStyle: "medium", timeZone: "UTC" })}</span>
        <PostStats post={post} />
      </div>
    </article>
  );
}

/** A compact topic row: thumbnail on the left, details on the right. */
export function BlogListItem({ post }: { post: BlogPost }) {
  const t = useTranslations("blog");

  return (
    <article className="group relative flex h-full items-center gap-3 rounded-2xl bg-card p-3 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28">
        <Image
          src={post.imageUrl}
          alt=""
          fill
          sizes="112px"
          className="object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transform-none"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide text-brand-red uppercase dark:text-red-400">{t(`topics.${post.topic}`)}</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm leading-snug font-semibold">
          <Link href="/blog" className="outline-none after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
          <WriterAvatar name={post.writer} className="size-5 text-[0.625rem]" />
          <span className="truncate">{post.writer}</span>
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <PostStats post={post} />
        </div>
      </div>
    </article>
  );
}
