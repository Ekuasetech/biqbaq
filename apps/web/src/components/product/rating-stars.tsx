import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const t = useTranslations("productDetail");

  return (
    <span role="img" aria-label={t("ratingLabel", { rating })} className={cn("inline-flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-4",
            n <= Math.round(rating) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
