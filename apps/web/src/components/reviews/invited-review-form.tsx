"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { SHOP_REVIEW_BODY_MAX, SHOP_REVIEW_NAME_MAX, shopReviewErrorKey } from "@/modules/shop-reviews";

/** The buyer's review of a shop, from the seller's one-time link (Q-67). No account needed. */
export function InvitedReviewForm({ token, shopName, shopSlug, buyerName }: { token: string; shopName: string; shopSlug: string; buyerName: string }) {
  const t = useTranslations("invitedReview");
  const [name, setName] = useState(buyerName);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!name.trim()) return setFailure("NAME_REQUIRED");
    if (!rating) return setFailure("RATING_REQUIRED");
    setWorking(true);
    setFailure(null);
    const response = await fetch(`/api/v1/review-invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, rating, body, website }),
    }).catch(() => null);
    setWorking(false);
    if (response?.ok) {
      setDone(true);
      return;
    }
    const answer = (await response?.json().catch(() => null)) as { error?: { code?: string } } | null;
    setFailure(shopReviewErrorKey(answer?.error?.code));
  }

  if (done) {
    return (
      <div role="status" className="grid gap-3">
        <h2 className="font-heading text-2xl font-extrabold">{t("thanksTitle")}</h2>
        <p className="text-muted-foreground">{t("thanks", { shop: shopName })}</p>
        <Link href={`/sellers/${shopSlug}`} className="w-fit font-semibold text-brand-red underline underline-offset-4">{t("seeShop", { shop: shopName })}</Link>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} noValidate aria-label={t("formLabel")} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("rating")}</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer" onMouseEnter={() => setHover(value)}>
              <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="peer sr-only" aria-label={t("stars", { count: value })} />
              <Star
                aria-hidden
                className={cn(
                  "size-9 rounded-md transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:scale-110",
                  value <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                )}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="review-name">{t("name")}</Label>
        <Input id="review-name" value={name} maxLength={SHOP_REVIEW_NAME_MAX} autoComplete="name" onChange={(event) => setName(event.target.value)} className="h-11 text-base md:text-sm" />
        <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="review-body">{t("body", { shop: shopName })}</Label>
        <Textarea id="review-body" rows={5} value={body} maxLength={SHOP_REVIEW_BODY_MAX} onChange={(event) => setBody(event.target.value)} />
      </div>
      {/* Left empty by people; robots fill it in. */}
      <div aria-hidden className="hidden">
        <label htmlFor="review-website">Website</label>
        <input id="review-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </div>
      {failure && <p role="alert" className="text-sm text-destructive">{t(`errors.${failure}`)}</p>}
      <button
        type="submit"
        disabled={working}
        className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-brand-red px-6 text-sm font-bold text-brand-red-foreground hover:bg-brand-red/90 disabled:opacity-60"
      >
        {working ? t("sending") : t("send")}
      </button>
      <p className="text-xs text-muted-foreground">{t("public")}</p>
    </form>
  );
}
