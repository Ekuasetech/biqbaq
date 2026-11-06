import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { getPathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** A plain GET form, so search works before or without JavaScript. */
export function SearchForm({ className, id }: { className?: string; id: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();

  return (
    <form
      role="search"
      action={getPathname({ href: "/products", locale })}
      className={cn("relative", className)}
    >
      <label htmlFor={id} className="sr-only">
        {t("searchLabel")}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        name="q"
        type="search"
        maxLength={100}
        placeholder={t("searchPlaceholder")}
        className="h-11 rounded-full border-transparent bg-card pl-9 text-base text-foreground shadow-sm md:text-sm"
      />
    </form>
  );
}
