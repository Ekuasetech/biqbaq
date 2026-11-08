import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { tryCleanDoc, type Doc } from "./rich-text";

/** Public fields of a published blog post (PRD §11.4), plus a reader count. */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  /** The formatted article, for posts written in the editor. Older posts have only paragraphs. */
  content: Doc | null;
  imageUrl: string;
  topic: string;
  topicNames: { en: string; fr: string };
  tags: { slug: string; name: string }[];
  writer: string;
  publishedAt: string;
  updatedAt: string;
  readMinutes: number;
  readers: number;
  seoTitle: string;
  seoDescription: string;
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_url: string | null;
  author_name: string;
  seo_title: string;
  seo_description: string;
  published_at: string;
  updated_at: string;
  category_slug: string | null;
  category_name_en: string | null;
  category_name_fr: string | null;
  readers: number;
  read_minutes: number;
  tags: { slug: string; name: string }[] | null;
  content?: unknown;
}

/** Paragraphs are separated by a blank line. Text stays text: nothing in a post becomes markup. */
export const toParagraphs = (body: string) =>
  body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export function toBlogPost(row: PostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: toParagraphs(row.body),
    // Checked again on the way out, so the page only ever draws known formatting.
    content: row.content ? tryCleanDoc(row.content) : null,
    imageUrl: row.cover_url ?? "",
    topic: row.category_slug ?? "",
    topicNames: { en: row.category_name_en ?? "", fr: row.category_name_fr ?? row.category_name_en ?? "" },
    tags: row.tags ?? [],
    writer: row.author_name,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    readMinutes: row.read_minutes,
    readers: Number(row.readers),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

const posts = () => getSupabasePublicClient().from("public_blog_posts").select("*");

function rows(result: { data: unknown; error: { code?: string } | null }) {
  if (result.error) throw new Error(`Blog lookup failed: ${result.error.code}`);
  return (result.data ?? []) as PostRow[];
}

// Pages read posts only through these functions. Cached with the catalogue, so publishing
// clears them, and a scheduled post appears within a few minutes of its time.

/** Most read first. */
export async function listPopularBlogPosts(limit?: number, excludeSlug?: string): Promise<BlogPost[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  let query = posts().order("readers", { ascending: false }).order("published_at", { ascending: false });
  if (excludeSlug) query = query.neq("slug", excludeSlug);
  if (limit) query = query.limit(limit);
  return rows(await query).map(toBlogPost);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const [row] = rows(await posts().eq("slug", slug).limit(1));
  return row ? toBlogPost(row) : null;
}

export async function listBlogPostSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  return rows(await getSupabasePublicClient().from("public_blog_posts").select("slug").order("published_at", { ascending: false }).limit(200)).map((row) => row.slug);
}
