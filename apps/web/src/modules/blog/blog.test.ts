import { describe, expect, it } from "vitest";
import { toBlogPost, toParagraphs } from "./index";

describe("toParagraphs", () => {
  it("splits on blank lines, keeps single line breaks, and drops empty ones", () => {
    expect(toParagraphs("One\n\nTwo\nstill two\r\n\r\n\n  \nThree  ")).toEqual(["One", "Two\nstill two", "Three"]);
    expect(toParagraphs("   ")).toEqual([]);
  });
  it("keeps markup as plain text", () => {
    expect(toParagraphs("<script>x</script>")).toEqual(["<script>x</script>"]);
  });
});

describe("toBlogPost", () => {
  it("builds what the pages need", () => {
    const post = toBlogPost({
      id: "1", slug: "a", title: "A", excerpt: "E", body: "P1\n\nP2", cover_url: null, author_name: "Biqbaq",
      seo_title: "", seo_description: "", published_at: "2026-11-07T00:00:00Z", updated_at: "2026-11-07T00:00:00Z",
      category_slug: "cargo", category_name_en: "Cargo", category_name_fr: null, readers: 12, read_minutes: 3, tags: null,
    });
    expect(post.body).toEqual(["P1", "P2"]);
    expect(post.imageUrl).toBe("");
    expect(post.topicNames).toEqual({ en: "Cargo", fr: "Cargo" });
    expect(post.tags).toEqual([]);
    expect(post.readers).toBe(12);
  });
});
