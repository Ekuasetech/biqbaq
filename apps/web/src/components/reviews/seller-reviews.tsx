import { BadgeCheck, Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { SellerReview } from "@/modules/shop-reviews";

function Stars({ rating, size = "size-4" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={cn(size, value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

/** "Shop reviews" on a seller's page (Q-67): what buyers the shop invited said about it. */
export async function SellerReviews({ locale, reviews, count, average }: { locale: string; reviews: SellerReview[]; count: number; average: number | null }) {
  const t = await getTranslations({ locale, namespace: "sellerReviews" });
  const format = await getFormatter({ locale });
  return (
    <section className="pt-10" aria-labelledby="seller-reviews-title">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="seller-reviews-title" className="font-heading text-2xl font-extrabold tracking-tight">{t("title")}</h2>
        {average !== null && (
          <p className="inline-flex items-center gap-2 text-sm font-semibold">
            <Stars rating={Math.round(average)} size="size-5" />
            <span>{t("summary", { average, count })}</span>
          </p>
        )}
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {reviews.map((review) => (
            <li key={review.id}>
              <article aria-label={t("by", { name: review.reviewer_name })} className="grid h-full gap-2 rounded-2xl bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="sr-only">{t("stars", { count: review.rating })}</span>
                  <span className="font-semibold">{review.reviewer_name}</span>
                  <time dateTime={review.created_at} className="text-xs text-muted-foreground">{format.dateTime(new Date(review.created_at), { dateStyle: "medium" })}</time>
                </div>
                {review.body && <p className="whitespace-pre-line break-words text-sm leading-relaxed">{review.body}</p>}
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <BadgeCheck className="size-3.5" aria-hidden />
                  {t("invited")}
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
