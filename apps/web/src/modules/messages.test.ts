import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// A screen that names a message that does not exist shows its key, such as
// "adsAdmin.photoErrors.GENERIC", instead of words. Every photo error must exist on every screen that uploads.
const PHOTO_CODES = ["FORMAT", "TOO_LARGE", "UNREADABLE", "UPLOAD_FAILED", "IMAGE_REJECTED", "MEDIA_NOT_CONFIGURED", "GENERIC"];

describe("photo error messages", () => {
  for (const screen of ["blogAdmin", "adsAdmin"] as const) {
    it(`exist for ${screen}, in both languages`, () => {
      for (const messages of [en, fr]) {
        const errors = (messages[screen] as unknown as { photoErrors: Record<string, string> }).photoErrors;
        for (const code of PHOTO_CODES) expect(errors?.[code], `${screen}.photoErrors.${code}`).toBeTruthy();
      }
    });
  }
});

describe("both languages", () => {
  it("have the same messages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
        : [prefix];
    const english = new Set(keys(en));
    const french = new Set(keys(fr));
    expect([...english].filter((key) => !french.has(key))).toEqual([]);
    expect([...french].filter((key) => !english.has(key))).toEqual([]);
  });
});
