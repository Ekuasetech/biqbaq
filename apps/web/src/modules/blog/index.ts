import { SAMPLE_BLOG_POSTS } from "./sample-data";

export const BLOG_TOPICS = ["business", "cargo", "food", "fashion"] as const;
export type BlogTopic = (typeof BLOG_TOPICS)[number];

/** Public fields of a published blog post (PRD §11.4), plus a reader count. */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  imageUrl: string;
  topic: BlogTopic;
  writer: string;
  publishedAt: string;
  readMinutes: number;
  readers: number;
}

const byMostRead = (a: BlogPost, b: BlogPost) => b.readers - a.readers;

// Pages read posts only through these functions, so swapping sample data for
// Supabase does not change any caller.

/** Most read first. */
export async function listPopularBlogPosts(limit?: number, excludeSlug?: string): Promise<BlogPost[]> {
  return SAMPLE_BLOG_POSTS.filter((post) => post.slug !== excludeSlug)
    .sort(byMostRead)
    .slice(0, limit);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  return SAMPLE_BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}

export async function listBlogPostSlugs(): Promise<string[]> {
  return SAMPLE_BLOG_POSTS.map((post) => post.slug);
}
