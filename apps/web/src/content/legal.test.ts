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

    it(`has no [bracketed] blanks left in ${document}, in either language`, () => {
      for (const locale of ["en", "fr"]) {
        const document_ = getLegalDocument(locale, document);
        const text = [document_.intro, ...document_.sections.flatMap((section) => section.paragraphs)].join("\n");
        expect(text).not.toMatch(/\[[^\]]+\]/);
        expect(document_.updated).toMatch(/2026/);
      }
    });
  }
});
