import { describe, expect, it } from "vitest";
import { docFromText } from "@/modules/blog/rich-text";
import { aboutDescription, aboutErrorKey, aboutFor } from "./index";

describe("aboutFor", () => {
  const english = docFromText("We connect Nigerians in Canada.");
  const french = docFromText("Nous rapprochons les Nigérians au Canada.");
  it("shows French to French visitors when it is written", () => {
    expect(aboutFor({ content_en: english, content_fr: french }, "fr")).toEqual(french);
    expect(aboutFor({ content_en: english, content_fr: french }, "en")).toEqual(english);
  });
  it("falls back to English when there is no French", () => {
    expect(aboutFor({ content_en: english, content_fr: null }, "fr")).toEqual(english);
    expect(aboutFor({ content_en: english, content_fr: docFromText("  ") }, "fr")).toEqual(english);
  });
  it("shows nothing for something that is not a document", () => {
    expect(aboutFor({ content_en: "<script>", content_fr: null }, "en")).toBeNull();
  });
});

describe("aboutDescription", () => {
  it("keeps short text, and shortens long text for search engines", () => {
    expect(aboutDescription("  Hello\n   there ")).toBe("Hello there");
    const long = aboutDescription("word ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("...")).toBe(true);
  });
  it("passes on known refusals only", () => {
    expect(aboutErrorKey("CONTENT_REQUIRED")).toBe("CONTENT_REQUIRED");
    expect(aboutErrorKey("weird")).toBe("GENERIC");
  });
});
