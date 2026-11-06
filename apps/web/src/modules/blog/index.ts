import { SAMPLE_BLOG_POSTS } from "./sample-data";

export const BLOG_TOPICS = ["business", "cargo", "food", "fashion"] as const;
export type BlogTopic = (typeof BLOG_TOPICS)[number];

/** Public fields of a published blog post (PRD §11.4), plus a reader count. */
export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  topic: BlogTopic;
  writer: string;
  publishedAt: string;
  readMinutes: number;
  readers: number;
}

// Pages read posts only through this function, so swapping sample data for
// Supabase does not change any caller. Most-read first.
export async function listPopularBlogPosts(limit: number): Promise<BlogPost[]> {
  return [...SAMPLE_BLOG_POSTS].sort((a, b) => b.readers - a.readers).slice(0, limit);
}
