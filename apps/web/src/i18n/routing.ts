import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  // English URLs stay unprefixed so canonical product URLs remain stable.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
