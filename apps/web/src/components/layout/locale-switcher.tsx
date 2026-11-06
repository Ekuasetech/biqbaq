"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="lg"
      aria-label={t("switchLanguage")}
      onClick={() =>
        // Read the query at click time so filters survive the language change.
        router.replace(`${pathname}${window.location.search}`, {
          locale: locale === "en" ? "fr" : "en",
        })
      }
    >
      {t("otherLanguage")}
    </Button>
  );
}
