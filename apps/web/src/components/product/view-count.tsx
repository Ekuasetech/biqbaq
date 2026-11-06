import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Number of views for a product or cargo listing. */
export function ViewCount({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("common");

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Eye className="size-3.5 shrink-0" aria-hidden />
      {t("views", { count })}
    </span>
  );
}
