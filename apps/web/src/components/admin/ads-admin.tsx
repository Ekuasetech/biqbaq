"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { AdCard } from "@/components/advertising/ad-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import {
  AD_FILTERS,
  adErrorKey,
  adSchema,
  adState,
  deleteAd,
  getAd,
  hasAdsAccess,
  listAds,
  saveAd,
  setAdActive,
  SITE_PLACEMENTS,
  type AdminAdRow,
  type EditableAd,
} from "@/modules/advertising/admin";
import { MediaError, uploadAdImage } from "@/modules/media-management/client";
import { refreshCatalog } from "@/modules/product-catalog/actions";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const PAGE_SIZE = 20;
const refreshPublic = () => refreshCatalog().catch(() => undefined);
const tone = (state: string) => (state === "live" ? "good" : state === "ended" ? "bad" : "waiting");

/** The local date and time, as a datetime-local input wants it. */
const toLocalInput = (iso: string | Date) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Editor({ adId, onClose }: { adId: string | null; onClose: () => void }) {
  const t = useTranslations("adsAdmin");
  const tPlaces = useTranslations("adsAdmin.placements");
  const [id, setId] = useState(adId);
  const [ad, setAd] = useState<EditableAd | null>(null);
  const now = new Date();
  const [form, setForm] = useState({
    title: "",
    advertiser: "",
    description: "",
    destination: "",
    placements: ["homepage", "global"] as string[],
    priority: "0",
    startsAt: toLocalInput(now),
    endsAt: toLocalInput(new Date(now.getTime() + 30 * 86400000)),
  });
  const [loaded, setLoaded] = useState(adId === null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (adIdToLoad: string) => {
    const { data, error } = await getAd(getSupabaseBrowserClient(), adIdToLoad);
    if (error) {
      setFailure(adErrorKey(error));
      return;
    }
    const loadedAd = data as EditableAd;
    setAd(loadedAd);
    setForm({
      title: loadedAd.title,
      advertiser: loadedAd.advertiser_name,
      description: loadedAd.description,
      destination: loadedAd.destination_url,
      placements: loadedAd.placements,
      priority: String(loadedAd.priority),
      startsAt: toLocalInput(loadedAd.starts_at),
      endsAt: toLocalInput(loadedAd.ends_at),
    });
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!adId) return;
    const timer = setTimeout(() => void load(adId), 0);
    return () => clearTimeout(timer);
  }, [load, adId]);

  const set = (key: "title" | "advertiser" | "description" | "destination" | "priority" | "startsAt" | "endsAt") => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value });

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>, message: string) {
    setWorking(true);
    setFailure(null);
    setNotice(null);
    const { error } = await action();
    if (error) setFailure(adErrorKey(error));
    else {
      await refreshPublic();
      if (id) await load(id);
      setNotice(message);
    }
    setWorking(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const parsed = adSchema.safeParse(form);
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    setNotice(null);
    const { data, error } = await saveAd(getSupabaseBrowserClient(), id, parsed.data);
    if (error) setFailure(adErrorKey(error));
    else {
      const savedId = data as string;
      setId(savedId);
      await refreshPublic();
      await load(savedId);
      setNotice(t("saved"));
    }
    setWorking(false);
  }

  async function upload(file: File) {
    if (!id) return;
    setWorking(true);
    setFailure(null);
    try {
      await uploadAdImage(id, file);
      await refreshPublic();
      await load(id);
      setNotice(t("imageSaved"));
    } catch (error) {
      setFailure(error instanceof MediaError ? `photo.${error.code}` : "generic");
    }
    setWorking(false);
  }

  async function remove() {
    if (!id) return;
    setWorking(true);
    const { error } = await deleteAd(id);
    setWorking(false);
    if (error) {
      setFailure(adErrorKey(error));
      return;
    }
    await refreshPublic();
    onClose();
  }

  // Any code without its own message gets the general one, never the message's name.
  const messageFor = (code: string) => {
    const key = code.startsWith("photo.") ? `photoErrors.${code.slice(6)}` : `errors.${code}`;
    return t.has(key) ? t(key) : t("errors.generic");
  };

  if (!loaded) return <Skeleton className="h-96 rounded-3xl" />;
  const state = ad ? adState(ad) : null;

  return (
    <section aria-labelledby="ad-editor" className={cn(cardClass, "grid gap-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ad-editor" className={headingClass}>{id ? t("editTitle") : t("newTitle")}</h2>
          {state && <StatusPill tone={tone(state)}>{t(`state.${state}`)}</StatusPill>}
        </div>
        <button type="button" onClick={onClose} className={secondaryButton}>{t("backToList")}</button>
      </div>
      {failure && <Notice kind="error">{messageFor(failure)}</Notice>}
      {notice && <Notice kind="info">{notice}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <form onSubmit={save} noValidate aria-label={t("adForm")} className="grid gap-4">
          <fieldset disabled={working} className="grid gap-4">
            <Field id="ad-title" label={t("fields.title")}>
              <Input id="ad-title" value={form.title} maxLength={120} onChange={set("title")} className="h-11 text-base md:text-sm" />
            </Field>
            <Field id="ad-advertiser" label={t("fields.advertiser")}>
              <Input id="ad-advertiser" value={form.advertiser} maxLength={100} onChange={set("advertiser")} className="h-11 text-base md:text-sm" />
            </Field>
            <Field id="ad-description" label={t("fields.description")} hint={t("hints.description")}>
              <Textarea id="ad-description" value={form.description} rows={4} maxLength={2000} onChange={set("description")} />
            </Field>
            <Field id="ad-destination" label={t("fields.destination")} hint={t("hints.destination")}>
              <Input id="ad-destination" value={form.destination} maxLength={2000} placeholder="https://" onChange={set("destination")} className="h-11 text-base md:text-sm" />
            </Field>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t("fields.placements")}</legend>
              {SITE_PLACEMENTS.map((place) => (
                <label key={place} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.placements.includes(place)}
                    onChange={(event) => setForm({ ...form, placements: event.target.checked ? [...form.placements, place] : form.placements.filter((p) => p !== place) })}
                    className="size-4"
                  />
                  {tPlaces(place)}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">{t("hints.placements")}</p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="ad-priority" label={t("fields.priority")} hint={t("hints.priority")}>
                <Input id="ad-priority" inputMode="numeric" value={form.priority} onChange={set("priority")} className="h-11 text-base md:text-sm" />
              </Field>
              <Field id="ad-starts" label={t("fields.startsAt")}>
                <Input id="ad-starts" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} className="h-11" />
              </Field>
              <Field id="ad-ends" label={t("fields.endsAt")}>
                <Input id="ad-ends" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} className="h-11" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={primaryButton}>{working ? t("working") : t(id ? "save" : "create")}</button>
            </div>
          </fieldset>
        </form>

        <div className="grid content-start gap-3">
          <p className="text-sm font-semibold">{t("preview")}</p>
          <div aria-label={t("preview")} role="group">
            <AdCard preview ad={{ slug: ad?.slug ?? "preview", title: form.title || t("previewTitle"), advertiser: form.advertiser || t("previewAdvertiser"), imageUrl: ad?.image_url ?? "" }} />
          </div>
          {id && (
            <>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("chooseImage")} onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }} />
              <button type="button" disabled={working} onClick={() => fileInput.current?.click()} className={secondaryButton}>{t(ad?.image_url ? "replaceImage" : "chooseImage")}</button>
            </>
          )}
          {!id && <p className="text-xs text-muted-foreground">{t("saveBeforeImage")}</p>}
        </div>
      </div>

      {id && ad && (
        <div className="grid gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">{t("hints.activate")}</p>
          <div className="flex flex-wrap gap-2">
            {ad.active ? (
              <button type="button" disabled={working} onClick={() => void run(() => setAdActive(getSupabaseBrowserClient(), id, false), t("turnedOff"))} className={secondaryButton}>{t("turnOff")}</button>
            ) : (
              <button type="button" disabled={working} onClick={() => void run(() => setAdActive(getSupabaseBrowserClient(), id, true), t("turnedOn"))} className={primaryButton}>{t("turnOn")}</button>
            )}
            {state === "live" && <Link href={`/ads/${ad.slug}`} prefetch={false} className={secondaryButton}>{t("viewAd")}</Link>}
            {confirmDelete ? (
              <>
                <span className="self-center text-sm">{t("deleteWarning")}</span>
                <button type="button" disabled={working} onClick={() => void remove()} className={cn(primaryButton, "bg-destructive hover:bg-destructive/90")}>{t("confirmDelete")}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={secondaryButton}>{t("cancel")}</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={secondaryButton}>{t("delete")}</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AdList({ onOpen }: { onOpen: (id: string | null) => void }) {
  const t = useTranslations("adsAdmin");
  const tPlaces = useTranslations("adsAdmin.placements");
  const format = useFormatter();
  const [filter, setFilter] = useState<string>("all");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminAdRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listAds(getSupabaseBrowserClient(), filter, search, page, PAGE_SIZE);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as AdminAdRow[]);
  }, [filter, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t("filterLabel")} className="flex flex-wrap gap-1.5">
          {AD_FILTERS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={filter === name} onClick={() => { setFilter(name); setPage(1); }}
              className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", filter === name ? "bg-brand-navy text-white" : "bg-muted")}>
              {t(`filters.${name}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onOpen(null)} className={primaryButton}>{t("newAd")}</button>
      </div>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(typed.trim()); setPage(1); }} className="flex gap-2">
        <Label htmlFor="ads-search" className="sr-only">{t("search")}</Label>
        <Input id="ads-search" placeholder={t("search")} value={typed} onChange={(event) => setTyped(event.target.value)} className="h-10" />
        <button type="submit" className={secondaryButton}>{t("searchButton")}</button>
      </form>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((row) => {
            const state = adState(row);
            return (
              <li key={row.id}>
                <article aria-label={row.title} className={cn(cardClass, "flex flex-wrap items-center justify-between gap-3 p-4 sm:p-4")}>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{row.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {row.advertiser_name} · {row.placements.map((p) => tPlaces(p)).join(", ")} · {t("priorityShort", { priority: row.priority })} ·{" "}
                      {t("dates", { from: format.dateTime(new Date(row.starts_at), { dateStyle: "medium" }), to: format.dateTime(new Date(row.ends_at), { dateStyle: "medium" }) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={tone(state)}>{t(`state.${state}`)}</StatusPill>
                    <button type="button" onClick={() => onOpen(row.id)} className={secondaryButton}>{t("edit")}</button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm">{t("page", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </nav>
      )}
    </div>
  );
}

function useAdsAccess(userId: string | undefined) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(async () => setAllowed(await hasAdsAccess(getSupabaseBrowserClient())), 0);
    return () => clearTimeout(timer);
  }, [userId]);
  return allowed;
}

/** Only appears for Super Admin and Co-admins given the ads permission. */
export function AdsLink({ className, children }: { className?: string; children: ReactNode }) {
  const user = useSessionUser();
  const allowed = useAdsAccess(user?.id);
  if (!allowed) return null;
  return <Link href="/admin/ads" className={className}>{children}</Link>;
}

/** Checking access here only decides what shows. The database refuses everyone else. */
export function AdsAdminScreen() {
  const t = useTranslations("admin");
  const user = useSessionUser();
  const allowed = useAdsAccess(user?.id);
  const [open, setOpen] = useState<{ id: string | null } | null>(null);
  if (user === undefined || (user && allowed === null)) return <Skeleton className="h-64 rounded-3xl" />;
  if (!user || !allowed) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className="font-heading text-xl font-extrabold">{t("noAccessTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{user ? t("noAdsAccess") : t("signInBody")}</p>
        <Link href={user ? "/account" : "/sign-in"} className={cn(primaryButton, "mt-5")}>{user ? t("backToAccount") : t("signIn")}</Link>
      </div>
    );
  }
  return open ? <Editor key={open.id ?? "new"} adId={open.id} onClose={() => setOpen(null)} /> : <AdList onOpen={(id) => setOpen({ id })} />;
}
