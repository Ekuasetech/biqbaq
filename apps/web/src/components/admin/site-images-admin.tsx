"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ACCEPTED_TYPES, MediaError, uploadSiteImage } from "@/modules/media-management/client";
import { resolveSiteImages, SITE_IMAGE_ALT_MAX, SITE_IMAGE_SLOTS, type SiteImageRow, type SiteImageSlot } from "@/modules/site-images";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const PHOTO_ERRORS = new Set(["FORMAT", "TOO_LARGE", "UNREADABLE", "UPLOAD_FAILED", "IMAGE_REJECTED", "MEDIA_NOT_CONFIGURED"]);

/** One photo slot: preview, upload, back to the original, and its description. */
export function Slot({ slot, row, onChanged }: { slot: SiteImageSlot; row: SiteImageRow | undefined; onChanged: () => Promise<void> }) {
  const t = useTranslations("siteImagesAdmin");
  const tHome = useTranslations("home");
  const locale = useLocale();
  const image = resolveSiteImages(row ? [row] : [], locale)[slot];
  const [working, setWorking] = useState<"upload" | "alt" | "reset" | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [altEn, setAltEn] = useState(row?.alt_en ?? "");
  const [altFr, setAltFr] = useState(row?.alt_fr ?? "");
  // A new photo starts with the description saved for it.
  const [shownUrl, setShownUrl] = useState(row?.image_url ?? null);
  if ((row?.image_url ?? null) !== shownUrl) {
    setShownUrl(row?.image_url ?? null);
    setAltEn(row?.alt_en ?? "");
    setAltFr(row?.alt_fr ?? "");
  }
  const headline = { hero_1: "slideSellerTitle", hero_2: "slideCargoTitle", hero_3: "slideTorontoTitle" } as const;

  async function upload(file: File | undefined) {
    if (!file || working) return;
    setWorking("upload");
    setMessage(null);
    try {
      await uploadSiteImage(slot, file);
      await onChanged();
      setMessage({ kind: "info", text: t("uploaded") });
    } catch (error) {
      const code = error instanceof MediaError && PHOTO_ERRORS.has(error.code) ? error.code : "GENERIC";
      setMessage({ kind: "error", text: t(`photoErrors.${code}`) });
    }
    setWorking(null);
  }

  async function describe(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    setWorking("alt");
    setMessage(null);
    const response = await fetch(`/api/v1/site-images/${slot}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altEn, altFr }),
    }).catch(() => null);
    setWorking(null);
    setMessage(response?.ok ? { kind: "info", text: t("described") } : { kind: "error", text: t("photoErrors.GENERIC") });
    if (response?.ok) await onChanged();
  }

  async function reset() {
    if (working || !window.confirm(t("resetConfirm"))) return;
    setWorking("reset");
    setMessage(null);
    const response = await fetch(`/api/v1/site-images/${slot}`, { method: "DELETE" }).catch(() => null);
    setWorking(null);
    if (!response?.ok) {
      setMessage({ kind: "error", text: t("photoErrors.GENERIC") });
      return;
    }
    setAltEn("");
    setAltFr("");
    await onChanged();
    setMessage({ kind: "info", text: t("resetDone") });
  }

  const input = `site-image-${slot}`;
  return (
    <section aria-labelledby={`${input}-title`} className={cn(cardClass, "grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl bg-muted",
          slot === "get_started" ? "aspect-[4/3]" : slot === "about" ? "aspect-[21/9]" : slot.startsWith("category_") ? "aspect-square max-w-48" : "aspect-[5/4]",
        )}
      >
        <Image src={image.src} alt={t("preview", { name: t(`slots.${slot}`) })} fill sizes="(min-width: 768px) 320px, 90vw" className="object-cover" />
      </div>
      <div className="grid min-w-0 content-start gap-3">
        <div>
          <h2 id={`${input}-title`} className={headingClass}>{t(`slots.${slot}`)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {slot === "get_started"
              ? t("getStartedHint")
              : slot === "about"
                ? t("aboutHint")
              : slot.startsWith("category_")
                ? t("categoryHint")
                : t("heroHint", { headline: tHome(headline[slot as keyof typeof headline]) })}
          </p>
          <p className="mt-1 text-xs font-semibold">{image.custom ? t("showingUpload") : t("showingOriginal")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor={input} className={cn(primaryButton, "h-10 cursor-pointer", working && "pointer-events-none opacity-60")}>
            {working === "upload" ? t("uploading") : image.custom ? t("replace") : t("upload")}
          </label>
          <input
            id={input}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="sr-only"
            disabled={working !== null}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {image.custom && (
            <button type="button" onClick={() => void reset()} disabled={working !== null} className={secondaryButton}>
              {working === "reset" ? t("working") : t("reset")}
            </button>
          )}
        </div>
        {image.custom && (
          <form onSubmit={describe} className="grid gap-2">
            <p className="text-sm font-medium">{t("altTitle")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor={`${input}-alt-en`}>{t("altEn")}</Label>
                <Input id={`${input}-alt-en`} value={altEn} maxLength={SITE_IMAGE_ALT_MAX} onChange={(event) => setAltEn(event.target.value)} className="h-10 text-base md:text-sm" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`${input}-alt-fr`}>{t("altFr")}</Label>
                <Input id={`${input}-alt-fr`} value={altFr} maxLength={SITE_IMAGE_ALT_MAX} onChange={(event) => setAltFr(event.target.value)} className="h-10 text-base md:text-sm" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("altHelp")}</p>
            <button type="submit" disabled={working !== null} className={cn(secondaryButton, "w-fit")}>
              {working === "alt" ? t("working") : t("saveAlt")}
            </button>
          </form>
        )}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
      </div>
    </section>
  );
}

/**
 * Super Admin changes the front page's own photos (owner's request, 2026-11-08): the hero's
 * three slides and the Get started photo. The database lets only Super Admin do this.
 */
export function SiteImagesAdmin() {
  const t = useTranslations("siteImagesAdmin");
  const [rows, setRows] = useState<SiteImageRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().from("public_site_images").select("slot, image_url, alt_en, alt_fr");
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows((data ?? []) as SiteImageRow[]);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
      {rows &&
        // The About us photo is changed on the About us page.
        SITE_IMAGE_SLOTS.filter((slot) => slot !== "about").map((slot) => {
          const row = rows.find((candidate) => candidate.slot === slot);
          return <Slot key={slot} slot={slot} row={row} onChanged={load} />;
        })}
    </div>
  );
}
