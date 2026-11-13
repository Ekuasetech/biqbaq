"use client";

import { Copy, MessageCircle, Share2, Star } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager } from "@/components/ui/pager";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { qrPreview } from "@/modules/referrals/qr";
import {
  cancelReviewInvite,
  createReviewInvite,
  listReviewInvites,
  listSellerReviews,
  REVIEW_INVITES_PAGE_SIZE,
  reviewInviteUrl,
  SHOP_REVIEW_NAME_MAX,
  shopReviewErrorKey,
  type ReviewInvite,
  type SellerReview,
} from "@/modules/shop-reviews";

const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={cn("size-4", value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

/** The link just made: to copy, send on WhatsApp, share from the phone, or show as a QR code. */
function NewLink({ url, buyer }: { url: string; buyer: string }) {
  const t = useTranslations("shopReviews");
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    qrPreview(url).then(setQr).catch(() => undefined);
    const timer = setTimeout(() => setCanShare(typeof navigator.share === "function"), 0);
    return () => clearTimeout(timer);
  }, [url]);
  const message = t("shareText", { name: buyer, url });

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-semibold">{t("linkFor", { name: buyer })}</p>
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt={t("qrAlt", { name: buyer })} width={112} height={112} className="size-28 rounded-xl border border-border bg-white" />}
        <div className="grid min-w-0 flex-1 gap-2">
          <Input readOnly value={url} aria-label={t("linkLabel")} onFocus={(event) => event.currentTarget.select()} className="h-10 font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => undefined);
                setCopied(true);
              }}
              className={secondaryButton}
            >
              <Copy className="size-4" aria-hidden />
              {copied ? t("copied") : t("copy")}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
              <MessageCircle className="size-4" aria-hidden />
              {t("whatsapp")}
            </a>
            {canShare && (
              <button type="button" onClick={() => void navigator.share({ title: t("shareTitle"), text: message }).catch(() => undefined)} className={secondaryButton}>
                <Share2 className="size-4" aria-hidden />
                {t("share")}
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("linkHint", { name: buyer })}</p>
    </div>
  );
}

/**
 * A shop's reviews from its buyers (Q-67): one-time links to ask each buyer, how each link
 * stands, and the reviews received. Reviews cannot be removed here; Biqbaq's moderators can
 * hide abusive ones.
 */
export function ShopReviews({ sellerId, shopSlug }: { sellerId: string; shopSlug: string }) {
  const t = useTranslations("shopReviews");
  const locale = useLocale();
  const format = useFormatter();
  const [buyer, setBuyer] = useState("");
  const [made, setMade] = useState<{ url: string; buyer: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [invites, setInvites] = useState<ReviewInvite[] | null>(null);
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<{ reviews: SellerReview[]; count: number; average: number | null } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [list, received] = await Promise.all([listReviewInvites(supabase, sellerId, page), listSellerReviews(supabase, shopSlug, 50)]);
    setInvites((list.data ?? []) as ReviewInvite[]);
    setReviews(received);
  }, [sellerId, shopSlug, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function make(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!buyer.trim()) return setFailure("NAME_REQUIRED");
    setWorking(true);
    setFailure(null);
    const { data, error } = await createReviewInvite(getSupabaseBrowserClient(), sellerId, buyer.trim());
    setWorking(false);
    if (error) return setFailure(shopReviewErrorKey(error.message));
    const row = (data as { token: string }[])[0];
    setMade({ url: reviewInviteUrl(window.location.origin, row.token, locale), buyer: buyer.trim() });
    setBuyer("");
    setPage(1);
    await load();
  }

  const tone = { waiting: "waiting", reviewed: "good", expired: "neutral", cancelled: "neutral" } as const;
  return (
    <div className="grid gap-4">
      <section aria-labelledby="ask-review" className={cn(cardClass, "grid gap-4")}>
        <div>
          <h2 id="ask-review" className={headingClass}>{t("askTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("askIntro")}</p>
        </div>
        <form onSubmit={make} noValidate className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="review-buyer">{t("buyerName")}</Label>
            <Input id="review-buyer" value={buyer} maxLength={SHOP_REVIEW_NAME_MAX} onChange={(event) => setBuyer(event.target.value)} className="h-11 text-base md:text-sm" />
          </div>
          <button type="submit" disabled={working} className={cn(primaryButton, "h-11")}>{working ? t("making") : t("make")}</button>
        </form>
        {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
        {made && <NewLink url={made.url} buyer={made.buyer} />}
      </section>

      <section aria-labelledby="review-links" className={cn(cardClass, "grid gap-3")}>
        <h2 id="review-links" className={headingClass}>{t("linksTitle")}</h2>
        {invites?.length === 0 && <p className="text-sm text-muted-foreground">{t("noLinks")}</p>}
        {invites && invites.length > 0 && (
          <ul aria-label={t("linksTitle")} className="grid gap-2">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{invite.buyer_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("made", { date: format.dateTime(new Date(invite.created_at), { dateStyle: "medium" }) })}
                    {invite.state === "waiting" && ` · ${t("expires", { date: format.dateTime(new Date(invite.expires_at), { dateStyle: "medium" }) })}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {invite.rating !== null && <Stars rating={invite.rating} />}
                  <StatusPill tone={tone[invite.state]}>{t(`states.${invite.state}`)}</StatusPill>
                  {invite.state === "waiting" && (
                    <>
                      <button type="button" onClick={() => setMade({ url: reviewInviteUrl(window.location.origin, invite.token, locale), buyer: invite.buyer_name })} className={secondaryButton}>
                        {t("showLink")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await cancelReviewInvite(getSupabaseBrowserClient(), invite.id);
                          await load();
                        }}
                        className={secondaryButton}
                      >
                        {t("withdraw")}
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {invites && invites.length > 0 && <Pager page={page} total={invites[0].total} pageSize={REVIEW_INVITES_PAGE_SIZE} onPage={setPage} label={t("linksPages")} />}
      </section>

      <section aria-labelledby="received-reviews" className={cn(cardClass, "grid gap-3")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="received-reviews" className={headingClass}>{t("reviewsTitle")}</h2>
          {reviews?.average != null && (
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Stars rating={Math.round(reviews.average)} />
              {t("average", { average: reviews.average, count: reviews.count })}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t("reviewsIntro")}</p>
        {reviews?.reviews.length === 0 && <p className="text-sm text-muted-foreground">{t("noReviews")}</p>}
        {reviews && reviews.reviews.length > 0 && (
          <ul className="grid gap-2">
            {reviews.reviews.map((review) => (
              <li key={review.id} className="grid gap-1 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="font-semibold">{review.reviewer_name}</span>
                  <span className="text-xs text-muted-foreground">{format.dateTime(new Date(review.created_at), { dateStyle: "medium" })}</span>
                </span>
                {review.body && <p className="whitespace-pre-line break-words">{review.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
