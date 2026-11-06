import type { BlogPost, BlogTopic } from "./index";

// SAMPLE DATA for the frontend preview. The articles, writers and reader counts
// are invented. Remove this file when the blog is built (Phase 6).

function post(
  index: number,
  title: string,
  excerpt: string,
  topic: BlogTopic,
  writer: string,
  publishedAt: string,
  readMinutes: number,
  readers: number,
): BlogPost {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title,
    excerpt,
    // Random placeholder photo: the seed fixes the image, not its subject.
    imageUrl: `https://picsum.photos/seed/biqbaq-blog-${index}/800/600`,
    topic,
    writer: `${writer} (sample)`,
    publishedAt,
    readMinutes,
    readers,
  };
}

export const SAMPLE_BLOG_POSTS: BlogPost[] = [
  post(1, "How to start selling your products online from Canada", "Sample article: first steps for turning a side business into an online store that customers trust.", "business", "Amara N.", "2026-10-28", 6, 3420),
  post(2, "What to know before sending cargo home to Nigeria", "Sample article: questions to ask a dealer, and how to pack your goods for the journey.", "cargo", "Tunde A.", "2026-10-21", 5, 2875),
  post(3, "Five ways small sellers can build customer trust", "Sample article: simple habits that help new sellers earn repeat customers.", "business", "Chidinma O.", "2026-10-14", 4, 1960),
  post(4, "Stocking your pantry with Nigerian groceries for the holidays", "Sample article: the staples worth buying early for your holiday cooking.", "food", "Bola K.", "2026-10-09", 3, 1540),
  post(5, "Styling Ankara for a Canadian winter", "Sample article: ways to keep bold prints in your wardrobe through the cold months.", "fashion", "Ngozi E.", "2026-10-02", 4, 1185),
];
