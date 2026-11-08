import { describe, expect, it } from "vitest";
import { blogErrorKey, categorySlug, parseTags, postSchema, postState } from "./admin";

const valid = { title: "T", excerpt: "", body: "", category: null, tags: [], author: "", seoTitle: "", seoDescription: "" };
const first = (input: object) => postSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;

describe("postSchema", () => {
  it("needs a title, and applies the database's limits", () => {
    expect(first({ title: "  " })).toBe("titleRequired");
    expect(first({ title: "x".repeat(201) })).toBe("tooLong");
    expect(first({ seoTitle: "x".repeat(71) })).toBe("tooLong");
    expect(first({ seoDescription: "x".repeat(161) })).toBe("tooLong");
    expect(first({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toBe("tooManyTags");
    expect(postSchema.safeParse(valid).success).toBe(true);
  });
});

describe("parseTags", () => {
  it("splits on commas, trims, and drops blanks and repeats", () => {
    expect(parseTags(" Cargo, cargo ,, Lagos ,Food")).toEqual(["Cargo", "Lagos", "Food"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("categorySlug", () => {
  it("makes a safe key", () => {
    expect(categorySlug("Immigration & Travel!")).toBe("immigration-travel");
    expect(categorySlug("Éducation")).toBe("education");
  });
});

describe("postState", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  it("tells scheduled from published by the date", () => {
    expect(postState("published", "2026-11-08T00:00:00Z", now)).toBe("scheduled");
    expect(postState("published", "2026-11-07T11:00:00Z", now)).toBe("published");
    expect(postState("draft", null, now)).toBe("draft");
    expect(postState("archived", "2026-11-01T00:00:00Z", now)).toBe("archived");
  });
});

describe("blogErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(blogErrorKey({ code: "23514", message: "POST_INCOMPLETE" })).toBe("incomplete");
    expect(blogErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(blogErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});
