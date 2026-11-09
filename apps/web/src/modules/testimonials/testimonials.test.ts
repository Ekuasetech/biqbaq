import { describe, expect, it } from "vitest";
import { testimonialsSlide, testimonialErrorKey } from "./index";

describe("testimonialsSlide", () => {
  it("keeps up to three quotes still, and slides more", () => {
    expect([0, 1, 2, 3].map(testimonialsSlide)).toEqual([false, false, false, false]);
    expect(testimonialsSlide(4)).toBe(true);
  });
});

describe("testimonialErrorKey", () => {
  it("passes on the database's own refusals, and hides anything else", () => {
    expect(testimonialErrorKey({ message: "TOO_MANY" })).toBe("TOO_MANY");
    expect(testimonialErrorKey({ message: "something odd" })).toBe("GENERIC");
    expect(testimonialErrorKey(null)).toBe("GENERIC");
  });
});
