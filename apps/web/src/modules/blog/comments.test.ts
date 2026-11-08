import { describe, expect, it } from "vitest";
import { commentErrorKey, commentSchema } from "./comments";

describe("commentSchema", () => {
  it("needs some words, within the limit, and trims them", () => {
    expect(commentSchema.parse({ body: "  Thanks!  " }).body).toBe("Thanks!");
    expect(commentSchema.safeParse({ body: "   " }).error?.issues[0]?.message).toBe("required");
    expect(commentSchema.safeParse({ body: "x".repeat(2001) }).error?.issues[0]?.message).toBe("tooLong");
  });
});

describe("commentErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(commentErrorKey({ code: "P0001", message: "RATE_LIMITED" })).toBe("rateLimited");
    expect(commentErrorKey({ code: "55000", message: "COMMENTS_DISABLED" })).toBe("disabled");
    expect(commentErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});
