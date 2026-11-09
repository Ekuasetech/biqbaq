import { docText, tryCleanDoc, type Doc } from "@/modules/blog/rich-text";

/**
 * The About us page (owner's request, 2026-11-08): a photo at the top, then a write-up in the
 * blog's editor, in English and, optionally, French. Only Super Admin writes it.
 */
export interface AboutPage {
  content_en: unknown;
  content_fr: unknown;
  text_en: string;
  text_fr: string;
  updated_at: string;
}

/** The write-up for a language: French when written, otherwise English. */
export function aboutFor(page: Pick<AboutPage, "content_en" | "content_fr">, locale: string): Doc | null {
  const french = locale === "fr" ? tryCleanDoc(page.content_fr) : null;
  if (french && docText(french).trim()) return french;
  return tryCleanDoc(page.content_en);
}

/** The page's description for search engines: its first words, up to 160 characters. */
export function aboutDescription(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 160 ? clean : `${clean.slice(0, 157).trimEnd()}...`;
}

const ERRORS = new Set(["CONTENT_INVALID", "CONTENT_REQUIRED", "PHOTOS_NOT_ALLOWED", "DETAILS_INVALID"]);
export const aboutErrorKey = (code: string | undefined) => (code && ERRORS.has(code) ? code : "GENERIC");
