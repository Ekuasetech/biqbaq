"use client";

import { Heart, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Notice, primaryButton } from "@/components/account/account-dashboard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import { refreshCatalog } from "@/modules/product-catalog/actions";
import {
  deleteMyReview,
  getReviewState,
  isFavourite,
  REVIEW_MAX_LENGTH,
  reviewErrorKey,
  reviewSchema,
  saveReview,
  setFavourite,
  type ReviewState,
} from "@/modules/reviews";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60";

/** Saved products live in the account, so this needs someone signed in. */
export function FavouriteButton({ productId }: { productId: string }) {
  const t = useTranslations("reviews");
  const user = useSessionUser();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      const { data } = await isFavourite(getSupabaseBrowserClient(), productId);
      setSaved(Boolean(data));
    }, 0);
    return () => clearTimeout(timer);
  }, [user, productId]);

  async function toggle() {
    if (working || saved === null) return;
    setWorking(true);
    setFailure(null);
    const { error } = await setFavourite(getSupabaseBrowserClient(), productId, !saved);
    if (error) setFailure(reviewErrorKey(error));
    else setSaved(!saved);
    setWorking(false);
  }

  if (user === undefined) return <div className="h-10" aria-hidden />;
  if (!user) {
    return (
      <div>
        <Link href="/sign-in" className={cn(secondaryButton, "gap-2")}>
          <Heart className="size-4" aria-hidden /> {t("favourite")}
        </Link>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("signInToSave")}</p>
      </div>
    );
  }
  return (
    <div>
      <Button variant="outline" size="lg" className="h-10" disabled={working || saved === null} aria-pressed={Boolean(saved)} onClick={() => void toggle()}>
        <Heart aria-hidden className={cn(saved && "fill-brand-red text-brand-red")} /> {t(saved ? "saved" : "favourite")}
      </Button>
      {failure && <p className="mt-1.5 text-xs text-destructive">{t(`errors.${failure}`)}</p>}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useTranslations("reviews");
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{t("yourRating")}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span className="sr-only">{t("stars", { count: n })}</span>
            <Star
              aria-hidden
              className={cn(
                "size-7 rounded peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                n <= value ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ productId }: { productId: string }) {
  const t = useTranslations("reviews");
  const router = useRouter();
  const user = useSessionUser();
  const [state, setState] = useState<ReviewState | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      const { state: next } = await getReviewState(getSupabaseBrowserClient(), productId);
      setState(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [user, productId]);

  async function after(message: string) {
    // The list on this page is shared by everyone, so it is refreshed, then shown again.
    await refreshCatalog().catch(() => undefined);
    const { state: next } = await getReviewState(getSupabaseBrowserClient(), productId);
    setState(next);
    setEditing(false);
    setNotice(message);
    router.refresh();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const parsed = reviewSchema.safeParse({ rating, body });
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await saveReview(getSupabaseBrowserClient(), productId, parsed.data.rating, parsed.data.body);
    if (error) setFailure(reviewErrorKey(error));
    else await after(t("saved"));
    setWorking(false);
  }

  async function remove() {
    if (working) return;
    setWorking(true);
    const { error } = await deleteMyReview(getSupabaseBrowserClient(), productId);
    if (error) setFailure(reviewErrorKey(error));
    else await after(t("deleted"));
    setWorking(false);
  }

  if (user === undefined || (user && !state)) return null;
  if (!user) {
    return (
      <p className="mt-4 text-sm">
        <Link href="/sign-in" className="font-semibold underline underline-offset-4">{t("signIn")}</Link> {t("signInToReview")}
      </p>
    );
  }
  if (!state) return null;
  if (state.reason === "own_shop") return <p className="mt-4 text-sm text-muted-foreground">{t("ownShop")}</p>;
  if (state.reason) return null;

  const hasReview = state.rating !== null;
  if (state.status === "hidden") return <p className="mt-4 text-sm text-muted-foreground">{t("hiddenNote")}</p>;

  if (!editing) {
    return (
      <div className="mt-4 grid gap-2">
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setRating(state.rating ?? 0);
              setBody(state.body ?? "");
              setFailure(null);
              setNotice(null);
              setEditing(true);
            }}
            className={hasReview ? secondaryButton : primaryButton}
          >
            {t(hasReview ? "edit" : "write")}
          </button>
          {hasReview && <button type="button" disabled={working} onClick={() => void remove()} className={secondaryButton}>{t("delete")}</button>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label={t(hasReview ? "edit" : "write")} className="mt-4 grid gap-3 rounded-2xl bg-card p-4 shadow-sm">
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <StarPicker value={rating} onChange={setRating} />
      <div className="grid gap-1.5">
        <Label htmlFor="review-body">{t("yourReview")}</Label>
        <Textarea id="review-body" value={body} rows={4} maxLength={REVIEW_MAX_LENGTH} onChange={(event) => setBody(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t("publicHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("publish")}</button>
        <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}
