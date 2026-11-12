import type { EmailLocale } from "./templates";

/**
 * Super Admin's own wording for emails (owner's request, 2026-11-11). Only changed fields
 * are kept; everything else uses the built-in text. Placeholders such as {shop} are filled in
 * when the email is made, and the result is escaped like any other text, so wording typed here
 * can never become markup.
 */
export const EMAIL_FIELDS = ["body", "action", "note", "heading", "tile_products", "tile_cargo"] as const;
export type EmailField = (typeof EMAIL_FIELDS)[number];

export interface EmailCustom {
  texts: Record<string, string>;
  /** The welcome email's photos, when Super Admin uploaded them. */
  images: { hero?: string; products?: string; cargo?: string };
}

export const NO_CUSTOM: EmailCustom = { texts: {}, images: {} };

export const textKey = (template: string, locale: EmailLocale, field: EmailField) => `${template}:${locale}:${field}`;

/** Super Admin's wording for a field, or the built-in text when there is none. */
export function pick(custom: EmailCustom, template: string, locale: EmailLocale, field: EmailField, builtIn: string): string {
  const value = custom.texts[textKey(template, locale, field)]?.trim();
  return value ? value : builtIn;
}

/** Puts the real values in place of {placeholders}. Unknown ones are left as they are. */
export const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{([a-z]+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? values[name] : whole));

/** The {placeholders} a piece of wording uses. */
export const placeholdersIn = (text: string) => [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1]))];

export function customFromRows(
  rows: { template: string; locale: string; field: string; value: string }[],
  images: EmailCustom["images"] = {},
): EmailCustom {
  const texts: Record<string, string> = {};
  for (const row of rows) {
    if ((row.locale === "en" || row.locale === "fr") && (EMAIL_FIELDS as readonly string[]).includes(row.field)) {
      texts[textKey(row.template, row.locale, row.field as EmailField)] = row.value;
    }
  }
  return { texts, images };
}
