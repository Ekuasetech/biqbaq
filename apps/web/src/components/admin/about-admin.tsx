"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Slot } from "@/components/admin/site-images-admin";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { aboutErrorKey } from "@/modules/about";
import { docFromText, tryCleanDoc, type Doc } from "@/modules/blog/rich-text";
import type { SiteImageRow } from "@/modules/site-images";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";

interface Draft {
  en: Doc;
  fr: Doc;
  published: boolean;
  savedPublished: boolean;
}

/**
 * Super Admin writes the About us page (owner's request, 2026-11-08): its photo, then the
 * write-up in the blog's editor, in English and French. French visitors read the English
 * until a French version is written.
 */
export function AboutAdmin() {
  const t = useTranslations("aboutAdmin");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photo, setPhoto] = useState<SiteImageRow | undefined>(undefined);
  const [language, setLanguage] = useState<"en" | "fr">("en");
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const loadPhoto = useCallback(async () => {
    const { data } = await getSupabaseBrowserClient().from("public_site_images").select("slot, image_url, alt_en, alt_fr").eq("slot", "about").maybeSingle();
    setPhoto((data as SiteImageRow | null) ?? undefined);
  }, []);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("admin_get_about_page");
      if (error) {
        setFailed(true);
        return;
      }
      const row = (data as { content_en: unknown; content_fr: unknown; published: boolean }[] | null)?.[0];
      setDraft({
        en: tryCleanDoc(row?.content_en) ?? docFromText(""),
        fr: tryCleanDoc(row?.content_fr) ?? docFromText(""),
        published: row?.published ?? false,
        savedPublished: row?.published ?? false,
      });
      await loadPhoto();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPhoto]);

  async function save(published: boolean) {
    if (!draft || working) return;
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/v1/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentEn: draft.en, contentFr: draft.fr, published }),
    }).catch(() => null);
    setWorking(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: { code?: string } } | null;
      setMessage({ kind: "error", text: t(`errors.${aboutErrorKey(body?.error?.code)}`) });
      return;
    }
    setDraft({ ...draft, published, savedPublished: published });
    setMessage({ kind: "info", text: t(published ? "savedPublished" : "savedDraft") });
  }

  if (failed) return <Notice kind="error">{t("loadFailed")}</Notice>;
  if (!draft) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone={draft.savedPublished ? "good" : "neutral"}>{draft.savedPublished ? t("live") : t("notLive")}</StatusPill>
        {draft.savedPublished && (
          <Link href="/about" target="_blank" className="text-sm font-semibold underline underline-offset-4">{t("view")}</Link>
        )}
      </div>

      <Slot slot="about" row={photo} onChanged={loadPhoto} />

      <section aria-labelledby="about-writeup" className={cn(cardClass, "grid gap-3")}>
        <div>
          <h2 id="about-writeup" className={headingClass}>{t("writeUp")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("writeUpHint")}</p>
        </div>
        <div role="tablist" aria-label={t("languages")} className="flex gap-2">
          {(["en", "fr"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={language === code}
              onClick={() => setLanguage(code)}
              className={cn(secondaryButton, "h-9", language === code && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
            >
              {t(`language.${code}`)}
            </button>
          ))}
        </div>
        {/* Both stay mounted, so switching language keeps what was typed. */}
        {(["en", "fr"] as const).map((code) => (
          <div key={code} hidden={language !== code}>
            <RichTextEditor
              id={`about-${code}`}
              label={t(`editorLabel.${code}`)}
              initial={draft[code]}
              postId={null}
              photos={false}
              onChange={(doc) => setDraft((current) => (current ? { ...current, [code]: doc } : current))}
              onError={() => setMessage({ kind: "error", text: t("errors.GENERIC") })}
            />
          </div>
        ))}
        {language === "fr" && <p className="text-xs text-muted-foreground">{t("frenchHint")}</p>}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={working} onClick={() => void save(true)} className={primaryButton}>
            {working ? t("saving") : draft.savedPublished ? t("saveLive") : t("publish")}
          </button>
          <button type="button" disabled={working} onClick={() => void save(false)} className={secondaryButton}>
            {draft.savedPublished ? t("unpublish") : t("saveDraft")}
          </button>
        </div>
      </section>
    </div>
  );
}
