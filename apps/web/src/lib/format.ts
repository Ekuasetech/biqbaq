import type { Money } from "@/modules/product-catalog";

const INTL_LOCALES: Record<string, string> = { en: "en-CA", fr: "fr-CA" };

export function formatPrice(price: Money, locale: string): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale] ?? locale, {
    style: "currency",
    currency: price.currency,
    currencyDisplay: "narrowSymbol",
  }).format(price.amountMinor / 100);
}

export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10;
}
