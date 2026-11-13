"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import {
  BLOG_FILTERS,
  blogErrorKey,
  categorySlug,
  createCategory,
  getPost,
  hasBlogAccess,
  LIMITS,
  listCategories,
  listPosts,
  parseTags,
  postSchema,
  postState,
  savePost,
  setPostStatus,
  type AdminPostRow,
  type BlogCategory,
  type EditablePost,
} from "@/modules/blog/admin";
import { ReasonAction } from "@/components/admin/moderation";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { listCommentsForModeration, setCommentHidden, type CommentForModeration } from "@/modules/blog/comments";
import { docFromText, tryCleanDoc, type Doc } from "@/modules/blog/rich-text";
import { MediaError, removeBlogCover, uploadBlogCover } from "@/modules/media-management/client";
import { refreshCatalog } from "@/modules/product-catalog/actions";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const PAGE_SIZE = 20;
const refreshPublic = () => refreshCatalog().catch(() => undefined);

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The local date and time, as a datetime-local input wants it. */
const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Editor({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const t = useTranslations("blogAdmin");
  const [id, setId] = useState(postId);
  const [post, setPost] = useState<EditablePost | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [form, setForm] = useState({ title: "", excerpt: "", category: "", tags: "", author: "Biqbaq", seoTitle: "", seoDescription: "" });
  const [loaded, setLoaded] = useState(postId === null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  // Ticked by default (owner's choice, 2026-11-13).
  const [emailList, setEmailList] = useState(true);
  const [newCategory, setNewCategory] = useState<{ en: string; fr: string } | null>(null);
  const [content, setContent] = useState<Doc>({ type: "doc", content: [] });
  const [editorKey, setEditorKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (postIdToLoad: string | null) => {
    const supabase = getSupabaseBrowserClient();
    const cats = await listCategories(supabase);
    setCategories((cats.data ?? []) as BlogCategory[]);
    if (!postIdToLoad) return;
    const { data, error } = await getPost(supabase, postIdToLoad);
    if (error) {
      setFailure(blogErrorKey(error));
      return;
    }
    const loadedPost = data as EditablePost;
    setPost(loadedPost);
    setContent(tryCleanDoc(loadedPost.content) ?? docFromText(loadedPost.body));
    setEditorKey((key) => key + 1);
    setForm({
      title: loadedPost.title,
      excerpt: loadedPost.excerpt,
      category: loadedPost.category_slug ?? "",
      tags: loadedPost.tags.join(", "),
      author: loadedPost.author_name,
      seoTitle: loadedPost.seo_title,
      seoDescription: loadedPost.seo_description,
    });
    setLoaded(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(postId), 0);
    return () => clearTimeout(timer);
  }, [load, postId]);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>, message: string) {
    setWorking(true);
    setFailure(null);
    setNotice(null);
    const { error } = await action();
    if (error) setFailure(blogErrorKey(error));
    else {
      await refreshPublic();
      if (id) await load(id);
      setNotice(message);
    }
    setWorking(false);
    return !error;
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (working) return;
    const parsed = postSchema.safeParse({
      title: form.title,
      excerpt: form.excerpt,
      body: "",
      category: form.category || null,
      tags: parseTags(form.tags),
      author: form.author,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
    });
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    setNotice(null);
    const { data, error } = await savePost(id, parsed.data, content);
    if (error) setFailure(blogErrorKey(error));
    else {
      const savedId = data as string;
      setId(savedId);
      await refreshPublic();
      await load(savedId);
      setNotice(t("saved"));
    }
    setWorking(false);
  }

  async function addCategory() {
    if (!newCategory) return;
    const slug = categorySlug(newCategory.en);
    const ok = await run(() => createCategory(getSupabaseBrowserClient(), slug, newCategory.en, newCategory.fr || newCategory.en), t("categoryAdded"));
    if (ok) {
      const cats = await listCategories(getSupabaseBrowserClient());
      setCategories((cats.data ?? []) as BlogCategory[]);
      setForm({ ...form, category: slug });
      setNewCategory(null);
    }
  }

  async function upload(file: File) {
    if (!id) return;
    setWorking(true);
    setFailure(null);
    try {
      await uploadBlogCover(id, file);
      await refreshPublic();
      await load(id);
      setNotice(t("coverSaved"));
    } catch (error) {
      setFailure(error instanceof MediaError ? `photo.${error.code}` : "generic");
    }
    setWorking(false);
  }

  async function removeCover() {
    if (!id) return;
    setWorking(true);
    setFailure(null);
    try {
      await removeBlogCover(id);
      await load(id);
      setNotice(t("coverRemoved"));
    } catch (error) {
      setFailure(error instanceof MediaError && error.code === "COVER_NEEDED" ? "coverNeeded" : "generic");
    }
    setWorking(false);
  }

  // Any code without its own message gets the general one, never the message's name.
  const messageFor = (code: string) => {
    const key = code.startsWith("photo.") ? `photoErrors.${code.slice(6)}` : `errors.${code}`;
    return t.has(key) ? t(key) : t("errors.generic");
  };

  if (!loaded) return <Skeleton className="h-96 rounded-3xl" />;
  const state = post ? postState(post.status, post.publish_at) : "draft";
  const archived = state === "archived";
  const canEmail = Boolean(post?.list_email) && !post?.emailed_at && state !== "published";
  const sendEmail = canEmail && emailList;

  return (
    <section aria-labelledby="blog-editor" className={cn(cardClass, "grid gap-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="blog-editor" className={headingClass}>{id ? t("editTitle") : t("newTitle")}</h2>
          {post && <StatusPill tone={state === "published" ? "good" : state === "archived" ? "bad" : "waiting"}>{t(`state.${state}`)}</StatusPill>}
        </div>
        <button type="button" onClick={onClose} className={secondaryButton}>{t("backToList")}</button>
      </div>
      {failure && <Notice kind="error">{messageFor(failure)}</Notice>}
      {notice && <Notice kind="info">{notice}</Notice>}
      {archived && <Notice kind="info">{t("archivedNote")}</Notice>}

      <form onSubmit={save} noValidate aria-label={t("postForm")} className="grid gap-4">
        <fieldset disabled={archived || working} className="grid gap-4">
          <Field id="post-title" label={t("fields.title")}>
            <Input id="post-title" value={form.title} maxLength={LIMITS.title} onChange={set("title")} className="h-11 text-base md:text-sm" />
          </Field>
          <Field id="post-excerpt" label={t("fields.excerpt")} hint={t("hints.excerpt")}>
            <Textarea id="post-excerpt" value={form.excerpt} rows={2} maxLength={LIMITS.excerpt} onChange={set("excerpt")} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("fields.body")}</span>
            <RichTextEditor
              key={editorKey}
              id="post-body"
              label={t("fields.body")}
              initial={content}
              postId={id}
              disabled={archived}
              onChange={setContent}
              onError={(code) => setFailure(code)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-category" label={t("fields.category")}>
              <select id="post-category" value={form.category} onChange={set("category")} className="h-11 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{t("chooseCategory")}</option>
                {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name_en}</option>)}
              </select>
            </Field>
            <Field id="post-author" label={t("fields.author")} hint={t("hints.author")}>
              <Input id="post-author" value={form.author} maxLength={LIMITS.author} onChange={set("author")} className="h-11 text-base md:text-sm" />
            </Field>
          </div>
          {newCategory ? (
            <div className="grid gap-3 rounded-2xl bg-muted/50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field id="category-en" label={t("fields.categoryEn")}>
                <Input id="category-en" value={newCategory.en} maxLength={60} onChange={(event) => setNewCategory({ ...newCategory, en: event.target.value })} className="h-11 text-base md:text-sm" />
              </Field>
              <Field id="category-fr" label={t("fields.categoryFr")}>
                <Input id="category-fr" value={newCategory.fr} maxLength={60} onChange={(event) => setNewCategory({ ...newCategory, fr: event.target.value })} className="h-11 text-base md:text-sm" />
              </Field>
              <div className="flex gap-2">
                <button type="button" onClick={() => void addCategory()} className={primaryButton}>{t("addCategory")}</button>
                <button type="button" onClick={() => setNewCategory(null)} className={secondaryButton}>{t("cancel")}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setNewCategory({ en: "", fr: "" })} className="w-fit text-sm font-semibold underline underline-offset-4">{t("newCategory")}</button>
          )}
          <Field id="post-tags" label={t("fields.tags")} hint={t("hints.tags")}>
            <Input id="post-tags" value={form.tags} onChange={set("tags")} className="h-11 text-base md:text-sm" />
          </Field>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">{t("seo")}</summary>
            <div className="mt-3 grid gap-4">
              <Field id="post-seo-title" label={t("fields.seoTitle")} hint={t("hints.seoTitle")}>
                <Input id="post-seo-title" value={form.seoTitle} maxLength={LIMITS.seoTitle} onChange={set("seoTitle")} className="h-11 text-base md:text-sm" />
              </Field>
              <Field id="post-seo-description" label={t("fields.seoDescription")} hint={t("hints.seoDescription")}>
                <Textarea id="post-seo-description" value={form.seoDescription} rows={2} maxLength={LIMITS.seoDescription} onChange={set("seoDescription")} />
              </Field>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton}>{working ? t("working") : t(id ? "save" : "saveDraft")}</button>
          </div>
        </fieldset>
      </form>

      {id && post && !archived && (
        <div className="grid gap-4 border-t border-border pt-4">
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("cover")}</h3>
            {post.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.cover_url} alt={t("coverAlt")} className="aspect-[16/9] w-full max-w-md rounded-2xl object-cover" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("noCover")}</p>
            )}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("chooseCover")} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }} />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={working} onClick={() => fileInput.current?.click()} className={secondaryButton}>{t(post.cover_url ? "replaceCover" : "chooseCover")}</button>
              {post.cover_url && state !== "published" && state !== "scheduled" && (
                <button type="button" disabled={working} onClick={() => void removeCover()} className={secondaryButton}>{t("removeCover")}</button>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("publishing")}</h3>
            <p className="text-xs text-muted-foreground">{t("hints.publish")}</p>
            <ListEmailChoice post={post} state={state} checked={emailList} onChange={setEmailList} disabled={working} />
            <div className="flex flex-wrap items-end gap-2">
              {state !== "published" && (
                <button type="button" disabled={working} onClick={() => void run(() => setPostStatus(getSupabaseBrowserClient(), id, "published", undefined, sendEmail), t(sendEmail ? "publishedEmailed" : "published"))} className={primaryButton}>{t("publishNow")}</button>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="post-schedule">{t("scheduleFor")}</Label>
                <Input id="post-schedule" type="datetime-local" min={toLocalInput(new Date())} value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className="h-10" />
              </div>
              <button
                type="button"
                disabled={working || !scheduleAt}
                onClick={() => void run(() => setPostStatus(getSupabaseBrowserClient(), id, "published", new Date(scheduleAt).toISOString(), sendEmail), t(sendEmail ? "scheduledEmailed" : "scheduled"))}
                className={secondaryButton}
              >
                {t("schedule")}
              </button>
              {state !== "draft" && (
                <button type="button" disabled={working} onClick={() => void run(() => setPostStatus(getSupabaseBrowserClient(), id, "draft"), t("unpublished"))} className={secondaryButton}>{t("unpublish")}</button>
              )}
              <button type="button" disabled={working} onClick={() => void run(() => setPostStatus(getSupabaseBrowserClient(), id, "archived"), t("archived"))} className={secondaryButton}>{t("archive")}</button>
            </div>
            {state === "published" && <Link href={`/blog/${post.slug}`} prefetch={false} className="w-fit text-sm font-semibold underline underline-offset-4">{t("viewPost")}</Link>}
          </div>
        </div>
      )}
      {id && post && archived && (
        <button type="button" disabled={working} onClick={() => void run(() => setPostStatus(getSupabaseBrowserClient(), id, "draft"), t("unarchived"))} className={cn(secondaryButton, "w-fit")}>{t("unarchive")}</button>
      )}
    </section>
  );
}

/**
 * Emailing a new post to Biqbaq's list (owner's request, 2026-11-13, Q-68): a tick box for
 * Super Admin, ticked by default, until the post has been emailed; then what happened.
 */
function ListEmailChoice({ post, state, checked, onChange, disabled }: { post: EditablePost; state: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  const t = useTranslations("blogAdmin.listEmail");
  const format = useFormatter();
  const list = post.list_email;
  if (post.emailed_at) {
    return (
      <p className="text-sm text-muted-foreground">
        {post.email_skipped
          ? t(`skipped.${post.email_skipped}`)
          : t("sent", { count: post.email_recipients ?? 0, date: format.dateTime(new Date(post.emailed_at), { dateStyle: "medium", timeStyle: "short" }) })}
      </p>
    );
  }
  // Live and not emailed: it was published without the box ticked.
  if (!list || state === "published") return null;
  const waiting = post.email_list && state === "scheduled";
  return (
    <div className="grid gap-1.5 rounded-xl bg-muted/50 p-3">
      <label className="flex items-start gap-2 text-sm font-medium">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>{t("label")}</span>
      </label>
      <p className="text-xs text-muted-foreground">
        {t("reach", { count: list.subscribers })}
        {list.subscribers > list.per_day && ` ${t("spread", { perDay: list.per_day })}`}
      </p>
      {!list.has_address && (
        <p className="text-xs font-semibold text-destructive">
          {t.rich("noAddress", { link: (chunks) => <Link href="/admin/email-lists" className="underline underline-offset-2">{chunks}</Link> })}
        </p>
      )}
      {waiting && <p className="text-xs text-muted-foreground">{t("waiting")}</p>}
    </div>
  );
}

function PostList({ onOpen }: { onOpen: (id: string | null) => void }) {
  const t = useTranslations("blogAdmin");
  const format = useFormatter();
  const [filter, setFilter] = useState<string>("all");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminPostRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listPosts(getSupabaseBrowserClient(), filter, search, page, PAGE_SIZE);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as AdminPostRow[]);
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
          {BLOG_FILTERS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={filter === name} onClick={() => { setFilter(name); setPage(1); }}
              className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", filter === name ? "bg-brand-navy text-white" : "bg-muted")}>
              {t(`filters.${name}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onOpen(null)} className={primaryButton}>{t("newPost")}</button>
      </div>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(typed.trim()); setPage(1); }} className="flex gap-2">
        <Label htmlFor="blog-search" className="sr-only">{t("search")}</Label>
        <Input id="blog-search" placeholder={t("search")} value={typed} onChange={(event) => setTyped(event.target.value)} className="h-10" />
        <button type="submit" className={secondaryButton}>{t("searchButton")}</button>
      </form>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((row) => {
            const state = postState(row.status, row.publish_at);
            return (
              <li key={row.id}>
                <article aria-label={row.title} className={cn(cardClass, "flex flex-wrap items-center justify-between gap-3 p-4 sm:p-4")}>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{row.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {row.author_name} · {t("readers", { count: Number(row.readers) })} ·{" "}
                      {state === "scheduled" && row.publish_at
                        ? t("goesLive", { date: format.dateTime(new Date(row.publish_at), { dateStyle: "medium", timeStyle: "short" }) })
                        : t("updated", { date: format.dateTime(new Date(row.updated_at), { dateStyle: "medium" }) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={state === "published" ? "good" : state === "archived" ? "bad" : "waiting"}>{t(`state.${state}`)}</StatusPill>
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

const COMMENT_FILTERS = ["published", "hidden", "all"] as const;

function CommentsPanel() {
  const t = useTranslations("blogAdmin");
  const format = useFormatter();
  const [filter, setFilter] = useState<string>("published");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CommentForModeration[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listCommentsForModeration(getSupabaseBrowserClient(), filter, search, page, PAGE_SIZE);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as CommentForModeration[]);
  }, [filter, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const supabase = getSupabaseBrowserClient();
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t("comments.filterLabel")} className="flex flex-wrap gap-1.5">
        {COMMENT_FILTERS.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={filter === name} onClick={() => { setFilter(name); setPage(1); }}
            className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", filter === name ? "bg-brand-navy text-white" : "bg-muted")}>
            {t(`comments.filters.${name}`)}
          </button>
        ))}
      </div>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(typed.trim()); setPage(1); }} className="flex gap-2">
        <Label htmlFor="comment-search" className="sr-only">{t("comments.search")}</Label>
        <Input id="comment-search" placeholder={t("comments.search")} value={typed} onChange={(event) => setTyped(event.target.value)} className="h-10" />
        <button type="submit" className={secondaryButton}>{t("searchButton")}</button>
      </form>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("comments.empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <article aria-label={t("comments.on", { post: row.post_title })} className={cn(cardClass, "grid gap-2 p-4 sm:p-4")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {row.author_name ?? row.author_email} · {row.post_title} · {format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <StatusPill tone={row.status === "published" ? "good" : "bad"}>{t(`comments.status.${row.status}`)}</StatusPill>
                </div>
                <p className="whitespace-pre-line break-words text-sm">{row.body}</p>
                {row.hidden_reason && <p className="text-xs text-muted-foreground">{t("comments.hiddenBecause", { reason: row.hidden_reason })}</p>}
                <div className="flex flex-wrap gap-2">
                  {row.status === "published" ? (
                    <ReasonAction id={`hide-${row.id}`} label={t("comments.hide")} destructive onConfirm={(reason) => setCommentHidden(supabase, row.id, true, reason)} onDone={load} />
                  ) : (
                    <ReasonAction id={`show-${row.id}`} label={t("comments.show")} onConfirm={(reason) => setCommentHidden(supabase, row.id, false, reason)} onDone={load} />
                  )}
                </div>
              </article>
            </li>
          ))}
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

function useBlogAccess(userId: string | undefined) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(async () => setAllowed(await hasBlogAccess(getSupabaseBrowserClient())), 0);
    return () => clearTimeout(timer);
  }, [userId]);
  return allowed;
}

/** Only appears for Super Admin and Co-admins given the blog permission. */
export function BlogLink({ className, children }: { className?: string; children: ReactNode }) {
  const user = useSessionUser();
  const allowed = useBlogAccess(user?.id);
  if (!allowed) return null;
  return <Link href="/admin/blog" className={className}>{children}</Link>;
}

/**
 * Checking access here only decides what this screen shows. The database refuses everyone
 * else, whatever they try.
 */
export function BlogAdminScreen() {
  const t = useTranslations("admin");
  const user = useSessionUser();
  const allowed = useBlogAccess(user?.id);
  const [open, setOpen] = useState<{ id: string | null } | null>(null);
  const [section, setSection] = useState<"posts" | "comments">("posts");
  const tBlog = useTranslations("blogAdmin");

  if (user === undefined || (user && allowed === null)) return <Skeleton className="h-64 rounded-3xl" />;
  if (!user || !allowed) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className="font-heading text-xl font-extrabold">{t("noAccessTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{user ? t("noBlogAccess") : t("signInBody")}</p>
        <Link href={user ? "/account" : "/sign-in"} className={cn(primaryButton, "mt-5")}>{user ? t("backToAccount") : t("signIn")}</Link>
      </div>
    );
  }
  if (open) return <Editor key={open.id ?? "new"} postId={open.id} onClose={() => setOpen(null)} />;
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={tBlog("sections")} className="flex gap-1 border-b border-border">
        {(["posts", "comments"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={section === name} onClick={() => setSection(name)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-semibold", section === name ? "border-brand-red" : "border-transparent text-muted-foreground")}>
            {tBlog(`sectionNames.${name}`)}
          </button>
        ))}
      </div>
      {section === "posts" ? <PostList onOpen={(id) => setOpen({ id })} /> : <CommentsPanel />}
    </div>
  );
}
