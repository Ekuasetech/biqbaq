"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Slot } from "@/components/admin/site-images-admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { SiteImageRow, SiteImageSlot } from "@/modules/site-images";

type Locale = "en" | "fr";
type Field = "body" | "action" | "note" | "heading" | "tile_products" | "tile_cargo";

interface Entry {
  template: string;
  group: "account" | "roles" | "shop" | "orders" | "messages";
  placeholders: string[];
  fields: Field[];
  defaults: Record<Locale, Partial<Record<Field, string>>>;
}

interface Saved {
  template: string;
  locale: Locale;
  field: Field;
  value: string;
}

const GROUPS = ["account", "roles", "shop", "orders", "messages"] as const;
const LONG: Field[] = ["body", "note"];
const WELCOME_PHOTOS: SiteImageSlot[] = ["email_welcome_hero", "email_tile_products", "email_tile_cargo"];
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function Editor({ entry, saved, onSaved }: { entry: Entry; saved: Saved[]; onSaved: () => Promise<void> }) {
  const t = useTranslations("emailTemplatesAdmin");
  const [locale, setLocale] = useState<Locale>("en");
  const savedFor = useCallback(
    (code: Locale) => Object.fromEntries(entry.fields.map((field) => [field, saved.find((row) => row.locale === code && row.field === field)?.value ?? ""])) as Record<Field, string>,
    [entry.fields, saved],
  );
  const [draft, setDraft] = useState<Record<Locale, Record<Field, string>>>(() => ({ en: savedFor("en"), fr: savedFor("fr") }));
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [photos, setPhotos] = useState<SiteImageRow[]>([]);
  const focused = useRef<{ field: Field; element: HTMLTextAreaElement | HTMLInputElement } | null>(null);

  const loadPhotos = useCallback(async () => {
    if (entry.template !== "welcome") return;
    const { data } = await getSupabaseBrowserClient().from("public_site_images").select("slot, image_url, alt_en, alt_fr").in("slot", WELCOME_PHOTOS);
    setPhotos((data ?? []) as SiteImageRow[]);
  }, [entry.template]);
  useEffect(() => {
    const timer = setTimeout(() => void loadPhotos(), 0);
    return () => clearTimeout(timer);
  }, [loadPhotos]);

  // The preview follows what is typed, a moment after typing stops.
  const fields = draft[locale];
  useEffect(() => {
    const timer = setTimeout(async () => {
      const response = await fetch("/api/v1/email-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: entry.template, locale, fields }),
      }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { data?: { subject: string; html: string } } | null;
      if (body?.data) setPreview(body.data);
    }, 400);
    return () => clearTimeout(timer);
  }, [entry.template, locale, fields, photos]);

  function set(field: Field, value: string) {
    setDraft((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  }

  function insert(name: string) {
    const target = focused.current;
    const field = target?.field ?? "body";
    const current = draft[locale][field] || entry.defaults[locale][field] || "";
    const at = target?.element.selectionStart ?? current.length;
    set(field, `${current.slice(0, at)}{${name}}${current.slice(at)}`);
  }

  async function save(values: Record<Field, string>, done: string) {
    setWorking(true);
    setMessage(null);
    const response = await fetch(`/api/v1/email-templates/${entry.template}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, fields: values }),
    }).catch(() => null);
    setWorking(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: { code?: string } } | null;
      const code = body?.error?.code;
      setMessage({ kind: "error", text: t(`errors.${code === "PLACEHOLDER_UNKNOWN" || code === "TOO_LONG" ? code : "GENERIC"}`) });
      return;
    }
    setMessage({ kind: "info", text: t(done) });
    await onSaved();
  }

  const blank = Object.fromEntries(entry.fields.map((field) => [field, ""])) as Record<Field, string>;
  return (
    <section aria-labelledby={`email-${entry.template}`} className={cn(cardClass, "grid gap-4")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`email-${entry.template}`} className={headingClass}>{t(`names.${entry.template}`)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subjectFixed", { subject: preview?.subject ?? "…" })}</p>
        </div>
        <div role="tablist" aria-label={t("language")} className="flex gap-2">
          {(["en", "fr"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={locale === code}
              onClick={() => setLocale(code)}
              className={cn(secondaryButton, "h-9", locale === code && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
            >
              {t(`languages.${code}`)}
            </button>
          ))}
        </div>
      </div>

      {entry.template === "welcome" && (
        <div className="grid gap-3">
          <p className="text-sm font-medium">{t("welcomePhotos")}</p>
          {WELCOME_PHOTOS.map((slot) => (
            <Slot key={slot} slot={slot} row={photos.find((row) => row.slot === slot)} onChanged={loadPhotos} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="grid content-start gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft[locale], "saved");
          }}
        >
          {entry.placeholders.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">{t("placeholders")}</p>
              <div className="flex flex-wrap gap-2">
                {entry.placeholders.map((name) => (
                  <button key={name} type="button" onClick={() => insert(name)} className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs hover:bg-card">
                    {`{${name}}`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("placeholdersHint")}</p>
            </div>
          )}
          {entry.fields.map((field) => {
            const id = `email-${entry.template}-${locale}-${field}`;
            const props = {
              id,
              value: draft[locale][field],
              placeholder: entry.defaults[locale][field] ?? "",
              maxLength: 3000,
              onFocus: (event: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                focused.current = { field, element: event.currentTarget };
              },
              onChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => set(field, event.target.value),
            };
            return (
              <div key={field} className="grid gap-1.5">
                <Label htmlFor={id}>{t(`fields.${field}`)}</Label>
                {LONG.includes(field) ? <Textarea rows={field === "body" ? 6 : 3} {...props} /> : <Input className="h-10 text-base md:text-sm" {...props} />}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">{t("blankHint")}</p>
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={working} className={primaryButton}>{working ? t("saving") : t("save")}</button>
            <button
              type="button"
              disabled={working}
              onClick={() => {
                if (!window.confirm(t("restoreConfirm"))) return;
                setDraft((current) => ({ ...current, [locale]: blank }));
                void save(blank, "restored");
              }}
              className={secondaryButton}
            >
              {t("restore")}
            </button>
          </div>
        </form>
        <div className="grid content-start gap-1.5">
          <p className="text-sm font-medium">{t("preview")}</p>
          <iframe
            title={t("previewTitle", { name: t(`names.${entry.template}`) })}
            srcDoc={preview?.html ?? ""}
            // Scripts stay off; same-origin only lets the page read its own preview.
            sandbox="allow-same-origin"
            className="h-[640px] w-full rounded-xl border border-border bg-white"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Super Admin rewords Biqbaq's emails (owner's request, 2026-11-11): each one's main text,
 * button and note in English and French, and the welcome email's heading, tiles and photos.
 * Subjects and links stay fixed; anything left blank uses the built-in wording.
 */
export function EmailTemplatesAdmin() {
  const t = useTranslations("emailTemplatesAdmin");
  const [emails, setEmails] = useState<Entry[] | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState("auth_signup");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/email-templates").catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: { emails: Entry[]; saved: Saved[] } } | null;
    if (!response?.ok || !body?.data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setEmails(body.data.emails);
    setSaved(body.data.saved);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const changed = useMemo(() => new Set(saved.map((row) => row.template)), [saved]);
  const current = emails?.find((entry) => entry.template === open) ?? null;

  if (failed) return <Notice kind="error">{t("loadFailed")}</Notice>;
  if (!emails) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label={t("listLabel")} className={cn(cardClass, "grid content-start gap-4 self-start")}>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {GROUPS.map((group) => (
          <div key={group} className="grid gap-1">
            <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t(`groups.${group}`)}</h2>
            <ul className="grid gap-0.5">
              {emails
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <li key={entry.template}>
                    <button
                      type="button"
                      aria-current={open === entry.template ? "true" : undefined}
                      onClick={() => setOpen(entry.template)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                        open === entry.template && "bg-muted font-semibold",
                      )}
                    >
                      <span className="min-w-0">{t(`names.${entry.template}`)}</span>
                      {changed.has(entry.template) && <StatusPill tone="good">{t("edited")}</StatusPill>}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      {current && <Editor key={current.template} entry={current} saved={saved.filter((row) => row.template === current.template)} onSaved={load} />}
    </div>
  );
}
