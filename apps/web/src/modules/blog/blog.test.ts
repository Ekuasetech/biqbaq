import { describe, expect, it } from "vitest";
import { getBlogPostBySlug, listBlogPostSlugs, listPopularBlogPosts } from "./index";

describe("blog posts", () => {
  it("gives every post a unique, URL-safe slug that finds it", async () => {
    const slugs = await listBlogPostSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
    for (const slug of slugs) expect((await getBlogPostBySlug(slug))?.slug).toBe(slug);
    expect(await getBlogPostBySlug("does-not-exist")).toBeNull();
  });

  it("lists the most read first", async () => {
    const readers = (await listPopularBlogPosts()).map((post) => post.readers);
    expect(readers).toEqual([...readers].sort((a, b) => b - a));
  });

  it("can leave out the article being read", async () => {
    const [top] = await listPopularBlogPosts(1);
    const others = await listPopularBlogPosts(5, top?.slug);
    expect(others).toHaveLength(4);
    expect(others.map((post) => post.slug)).not.toContain(top?.slug);
  });

  it("gives every post a body to read", async () => {
    for (const post of await listPopularBlogPosts()) expect(post.body.length).toBeGreaterThan(0);
  });
});
