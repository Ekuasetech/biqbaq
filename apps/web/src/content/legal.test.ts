import { describe, expect, it } from "vitest";
import { getLegalDocument } from "./legal";

describe("legal documents", () => {
  for (const document of ["conditions", "privacy"] as const) {
    it(`has matching ${document} structure in English and French`, () => {
      const en = getLegalDocument("en", document);
      const fr = getLegalDocument("fr", document);
      expect(fr.sections.length).toBe(en.sections.length);
      en.sections.forEach((section, index) => {
        expect(fr.sections[index]?.paragraphs.length).toBe(section.paragraphs.length);
      });
    });

    it(`marks the same number of blanks in ${document} in both languages`, () => {
      const blanks = (locale: string) =>
        JSON.stringify(getLegalDocument(locale, document)).match(/\[[^\]]+\]/g)?.length ?? 0;
      expect(blanks("en")).toBeGreaterThan(0);
      expect(blanks("fr")).toBe(blanks("en"));
    });
  }
});
