import type { BlogPost, BlogTopic } from "./index";

// SAMPLE DATA for the frontend preview. The articles, writers and reader counts
// are invented, and are not advice. Remove this file when the blog is built (Phase 6).

function post(
  index: number,
  title: string,
  excerpt: string,
  topic: BlogTopic,
  writer: string,
  publishedAt: string,
  readMinutes: number,
  readers: number,
  body: string[],
): BlogPost {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    title,
    excerpt,
    body,
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
  post(1, "How to start selling your products online from Canada", "Sample article: first steps for turning a side business into an online store that customers trust.", "business", "Amara N.", "2026-10-28", 6, 3420, [
    "This is sample text to show how an article will look. Many small businesses begin with one product and a handful of customers who already know them.",
    "A good first step is writing a clear description of what you sell, with honest photos and a fair price. Customers want to know exactly what they are getting and who they are buying from.",
    "Once your first listings are live, ask customers for feedback, respond to questions quickly, and add new products as you learn what people want.",
  ]),
  post(2, "What to know before sending cargo home to Nigeria", "Sample article: questions to ask a dealer, and how to pack your goods for the journey.", "cargo", "Tunde A.", "2026-10-21", 5, 2875, [
    "This is sample text to show how an article will look. Sending goods in a car going home can be convenient, but it helps to agree on the details early.",
    "Ask the dealer about estimated dates, how much space is available, and what cannot be included. Pack items securely, and label your boxes clearly.",
    "Rules on shipping and customs can change, so confirm what applies to your goods before you send them.",
  ]),
  post(3, "Five ways small sellers can build customer trust", "Sample article: simple habits that help new sellers earn repeat customers.", "business", "Chidinma O.", "2026-10-14", 4, 1960, [
    "This is sample text to show how an article will look. Trust grows through small, consistent actions rather than big promises.",
    "Use clear photos, describe products accurately, answer messages promptly, and keep your availability up to date. Completing identity verification also shows customers you are serious.",
    "When something goes wrong, respond quickly and fairly. Customers often remember how a problem was handled more than the problem itself.",
  ]),
  post(4, "Stocking your pantry with Nigerian groceries for the holidays", "Sample article: the staples worth buying early for your holiday cooking.", "food", "Bola K.", "2026-10-09", 3, 1540, [
    "This is sample text to show how an article will look. Holiday cooking is easier when the basics are already in your cupboard.",
    "Staples such as rice, spices, ground egusi and dried goods keep well, so they are worth buying ahead of the busy season.",
    "Local sellers can be a great source, and many will tell you what is in stock if you ask.",
  ]),
  post(5, "Styling Ankara for a Canadian winter", "Sample article: ways to keep bold prints in your wardrobe through the cold months.", "fashion", "Ngozi E.", "2026-10-02", 4, 1185, [
    "This is sample text to show how an article will look. Cold weather does not have to mean giving up colour.",
    "Layer an Ankara top under a neutral coat, add a printed scarf, or carry a bold tote to brighten a winter outfit.",
    "Small touches like these keep your style recognisably yours, whatever the temperature outside.",
  ]),
];
