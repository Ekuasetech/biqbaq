import { describe, expect, it } from "vitest";
import { reviewErrorKey, reviewSchema } from "./index";

const first = (input: object) => reviewSchema.safeParse(input).error?.issues[0]?.message;

describe("reviewSchema", () => {
  it("accepts a rating with or without words, and trims them", () => {
    expect(reviewSchema.parse({ rating: "4", body: "  Good  " })).toEqual({ rating: 4, body: "Good" });
    expect(reviewSchema.parse({ rating: 5 })).toEqual({ rating: 5, body: "" });
  });
  it("needs a whole rating from 1 to 5", () => {
    for (const rating of [0, 6, 2.5, "", "x", undefined]) expect(first({ rating, body: "" }), String(rating)).toBe("ratingRequired");
  });
  it("applies the same length limit as the database", () => {
    expect(first({ rating: 3, body: "x".repeat(2001) })).toBe("tooLong");
    expect(reviewSchema.safeParse({ rating: 3, body: "x".repeat(2000) }).success).toBe(true);
  });
});

describe("reviewErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(reviewErrorKey({ code: "42501", message: "CANNOT_REVIEW_OWN" })).toBe("ownShop");
    expect(reviewErrorKey({ code: "55000", message: "REVIEW_HIDDEN" })).toBe("hidden");
    expect(reviewErrorKey({ code: "P0001", message: "RATE_LIMITED" })).toBe("rateLimited");
    expect(reviewErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});
