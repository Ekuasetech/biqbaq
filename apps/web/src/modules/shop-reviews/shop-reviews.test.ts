import { describe, expect, it } from "vitest";
import { invitedReviewSchema, reviewInviteUrl, reviewTokenSchema, shopReviewErrorKey } from "./index";

const token = "a".repeat(64);

describe("reviewInviteUrl", () => {
  it("points at the buyer's review page, in French when asked", () => {
    expect(reviewInviteUrl("https://biqbaq.com/", token, "en")).toBe(`https://biqbaq.com/review/${token}`);
    expect(reviewInviteUrl("https://biqbaq.com", token, "fr")).toBe(`https://biqbaq.com/fr/review/${token}`);
  });
});

describe("reviewTokenSchema", () => {
  it("accepts only 64 lowercase hex characters", () => {
    expect(reviewTokenSchema.safeParse(token).success).toBe(true);
    expect(reviewTokenSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(reviewTokenSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(reviewTokenSchema.safeParse("../etc").success).toBe(false);
  });
});

describe("invitedReviewSchema", () => {
  it("needs a name and a whole rating from 1 to 5", () => {
    expect(invitedReviewSchema.safeParse({ name: " Ada ", rating: 5 }).data).toEqual({ name: "Ada", rating: 5, body: "" });
    expect(invitedReviewSchema.safeParse({ name: " ", rating: 5 }).success).toBe(false);
    expect(invitedReviewSchema.safeParse({ name: "Ada", rating: 0 }).success).toBe(false);
    expect(invitedReviewSchema.safeParse({ name: "Ada", rating: 6 }).success).toBe(false);
    expect(invitedReviewSchema.safeParse({ name: "Ada", rating: 4.5 }).success).toBe(false);
  });

  it("limits the name and the words", () => {
    expect(invitedReviewSchema.safeParse({ name: "a".repeat(81), rating: 3 }).success).toBe(false);
    expect(invitedReviewSchema.safeParse({ name: "Ada", rating: 3, body: "a".repeat(2001) }).success).toBe(false);
    expect(invitedReviewSchema.safeParse({ name: "Ada", rating: 3, body: "a".repeat(2000) }).success).toBe(true);
  });
});

describe("shopReviewErrorKey", () => {
  it("keeps known codes and hides the rest", () => {
    expect(shopReviewErrorKey("INVITE_USED")).toBe("INVITE_USED");
    expect(shopReviewErrorKey("TOO_MANY_INVITES")).toBe("TOO_MANY_INVITES");
    expect(shopReviewErrorKey("NOT_AUTHORIZED")).toBe("GENERIC");
    expect(shopReviewErrorKey(undefined)).toBe("GENERIC");
  });
});
