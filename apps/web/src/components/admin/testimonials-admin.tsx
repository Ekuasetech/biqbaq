"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { refreshCatalog } from "@/modules/product-catalog/actions";
import {
  deleteTestimonial,
  listTestimonialsForAdmin,
  moveTestimonial,
  saveTestimonial,
  TESTIMONIAL_CITY_MAX,
  TESTIMONIAL_NAME_MAX,
  TESTIMONIAL_QUOTE_MAX,
  testimonialErrorKey,
  type AdminTestimonial,
} from "@/modules/testimonials";

const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";
// The front page shows changes at once; if this refresh fails, it catches up within minutes.
const refreshFrontPage = () => refreshCatalog().catch(() => undefined);

function Editor({ testimonial, onCancel, onSaved }: { testimonial: AdminTestimonial | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations("testimonialsAdmin");
  const [quote, setQuote] = useState(testimonial?.quote ?? "");
  const [name, setName] = useState(testimonial?.name ?? "");
  const [city, setCity] = useState(testimonial?.city ?? "");
  const [published, setPublished] = useState(testimonial?.published ?? true);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const id = testimonial?.id ?? "new";

  async function save(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!quote.trim() || !name.trim()) {
      setFailure("DETAILS_INVALID");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await saveTestimonial(getSupabaseBrowserClient(), testimonial?.id ?? null, { quote, name, city, published });
    setWorking(false);
    if (error) {
      setFailure(testimonialErrorKey(error));
      return;
    }
    await refreshFrontPage();
    await onSaved();
  }

  return (
    <form onSubmit={save} noValidate aria-label={testimonial ? t("editLabel", { name: testimonial.name }) : t("newLabel")} className="grid gap-3 rounded-2xl border border-border p-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`quote-${id}`}>{t("quote")}</Label>
        <Textarea id={`quote-${id}`} rows={3} maxLength={TESTIMONIAL_QUOTE_MAX} value={quote} onChange={(event) => setQuote(event.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`name-${id}`}>{t("name")}</Label>
          <Input id={`name-${id}`} maxLength={TESTIMONIAL_NAME_MAX} value={name} onChange={(event) => setName(event.target.value)} className="h-10 text-base md:text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`city-${id}`}>{t("city")}</Label>
          <Input id={`city-${id}`} maxLength={TESTIMONIAL_CITY_MAX} value={city} onChange={(event) => setCity(event.target.value)} className="h-10 text-base md:text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} className="size-4" />
        {t("publishedLabel")}
      </label>
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("saving") : t("save")}</button>
        <button type="button" onClick={onCancel} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

/**
 * Super Admin writes "What customers say" on the front page (owner's request, 2026-11-08):
 * adds, edits, orders, publishes and deletes quotes. The database checks every change.
 */
export function TestimonialsAdmin() {
  const t = useTranslations("testimonialsAdmin");
  const [rows, setRows] = useState<AdminTestimonial[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await listTestimonialsForAdmin(getSupabaseBrowserClient());
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows((data ?? []) as AdminTestimonial[]);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function act(action: () => PromiseLike<{ error: { message?: string } | null }>, done: string) {
    setMessage(null);
    const { error } = await action();
    if (error) {
      setMessage({ kind: "error", text: t(`errors.${testimonialErrorKey(error)}`) });
      return;
    }
    await refreshFrontPage();
    setMessage({ kind: "info", text: t(done) });
    await load();
  }

  const supabase = getSupabaseBrowserClient();
  const published = rows?.filter((row) => row.published).length ?? 0;
  return (
    <div className="grid gap-4">
      <section aria-labelledby="testimonials-admin" className={cn(cardClass, "grid gap-4")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="testimonials-admin" className={headingClass}>{t("listTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
          </div>
          {editing !== "new" && (
            <button type="button" onClick={() => setEditing("new")} className={primaryButton}>{t("add")}</button>
          )}
        </div>
        {rows && <p className="text-sm font-medium">{published === 0 ? t("noneShown") : t("shown", { count: published })}</p>}
        {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        {editing === "new" && (
          <Editor
            testimonial={null}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              setMessage({ kind: "info", text: t("added") });
              await load();
            }}
          />
        )}
        {rows?.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {rows && rows.length > 0 && (
          <ul aria-label={t("listTitle")} className="grid gap-3">
            {rows.map((row, index) =>
              editing === row.id ? (
                <li key={row.id}>
                  <Editor
                    testimonial={row}
                    onCancel={() => setEditing(null)}
                    onSaved={async () => {
                      setEditing(null);
                      setMessage({ kind: "info", text: t("saved") });
                      await load();
                    }}
                  />
                </li>
              ) : (
                <li key={row.id}>
                  <article aria-label={row.name} className="grid gap-3 rounded-2xl bg-muted/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 break-words text-sm">&ldquo;{row.quote}&rdquo;</p>
                      <StatusPill tone={row.published ? "good" : "neutral"}>{row.published ? t("published") : t("hidden")}</StatusPill>
                    </div>
                    <p className="text-sm font-semibold">
                      {row.name}
                      {row.city && <span className="font-normal text-muted-foreground"> · {row.city}</span>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEditing(row.id)} className={secondaryButton}>{t("edit")}</button>
                      <button
                        type="button"
                        onClick={() => void act(() => saveTestimonial(supabase, row.id, { ...row, published: !row.published }), row.published ? "hiddenDone" : "publishedDone")}
                        className={secondaryButton}
                      >
                        {row.published ? t("hide") : t("publish")}
                      </button>
                      <button type="button" disabled={index === 0} aria-label={t("moveUp", { name: row.name })} onClick={() => void act(() => moveTestimonial(supabase, row.id, -1), "moved")} className={secondaryButton}>
                        <ArrowUp className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={index === rows.length - 1}
                        aria-label={t("moveDown", { name: row.name })}
                        onClick={() => void act(() => moveTestimonial(supabase, row.id, 1), "moved")}
                        className={secondaryButton}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t("deleteConfirm", { name: row.name }))) void act(() => deleteTestimonial(supabase, row.id), "deleted");
                        }}
                        className={secondaryButton}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </article>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
