import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const BLOG_FILTERS = ["all", "draft", "scheduled", "published", "archived"] as const;
export const LIMITS = { title: 200, excerpt: 300, body: 50000, author: 100, seoTitle: 70, seoDescription: 160, tags: 10, tag: 40 } as const;

// Error values are keys into the blogAdmin.errors messages. The database applies the same rules.
export const postSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(LIMITS.title, "tooLong"),
  excerpt: z.string().trim().max(LIMITS.excerpt, "tooLong"),
  body: z.string().trim().max(LIMITS.body, "tooLong"),
  category: z.string().nullable(),
  tags: z.array(z.string().trim().min(1).max(LIMITS.tag, "tooLong")).max(LIMITS.tags, "tooManyTags"),
  author: z.string().trim().max(LIMITS.author, "tooLong"),
  seoTitle: z.string().trim().max(LIMITS.seoTitle, "tooLong"),
  seoDescription: z.string().trim().max(LIMITS.seoDescription, "tooLong"),
});
export type PostForm = z.infer<typeof postSchema>;

/** Tags are typed as a comma-separated list. Repeats are dropped, whatever their case. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
}

/** A URL-safe key for a new category, from its English name. */
export const categorySlug = (name: string) =>
  name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export type PostState = "draft" | "scheduled" | "published" | "archived";

export function postState(status: string, publishAt: string | null, now = Date.now()): PostState {
  if (status === "published") return publishAt && new Date(publishAt).getTime() > now ? "scheduled" : "published";
  return status === "archived" ? "archived" : "draft";
}

export interface AdminPostRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  publish_at: string | null;
  updated_at: string;
  author_name: string;
  category_slug: string | null;
  readers: number;
  total: number;
}

export interface EditablePost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  content: unknown;
  category_slug: string | null;
  tags: string[];
  author_name: string;
  seo_title: string;
  seo_description: string;
  status: string;
  publish_at: string | null;
  cover_url: string | null;
  /** Super Admin's choice to email the post to Biqbaq's list when it goes live (Q-68). */
  email_list: boolean;
  emailed_at: string | null;
  email_recipients: number | null;
  email_skipped: "no_address" | "no_subscribers" | "email_off" | null;
  /** Only for Super Admin: who the email would reach. */
  list_email: { subscribers: number; has_address: boolean; per_day: number } | null;
}

export interface BlogCategory {
  slug: string;
  name_en: string;
  name_fr: string;
}

// Every function here is also checked by the database, whatever this code or the page does.

export async function hasBlogAccess(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("my_blog_access");
  return !error && data === true;
}
export const listPosts = (supabase: SupabaseClient, filter: string, search: string, page: number, pageSize: number) =>
  supabase.rpc("admin_list_blog_posts", { p_status: filter === "all" ? null : filter, p_search: search || null, p_limit: pageSize, p_offset: (page - 1) * pageSize });
export const getPost = (supabase: SupabaseClient, id: string) => supabase.rpc("get_blog_post_for_editing", { p_id: id });
export const listCategories = (supabase: SupabaseClient) => supabase.from("blog_categories").select("slug, name_en, name_fr").order("name_en");
export const createCategory = (supabase: SupabaseClient, slug: string, nameEn: string, nameFr: string) =>
  supabase.rpc("create_blog_category", { p_slug: slug, p_name_en: nameEn, p_name_fr: nameFr });
/** Saves through the server, which checks the article before the database stores it. */
export async function savePost(id: string | null, form: PostForm, content: unknown): Promise<{ data: string | null; error: { code?: string; message?: string } | null }> {
  const response = await fetch("/api/v1/blog/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...form, content }),
  }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok) return { data: null, error: { message: json?.error?.code ?? "GENERIC" } };
  return { data: json.data.id as string, error: null };
}
export const setPostStatus = (supabase: SupabaseClient, id: string, status: "draft" | "published" | "archived", publishAt?: string, emailList = false) =>
  supabase.rpc("set_blog_post_status", { p_id: id, p_status: status, p_publish_at: publishAt ?? null, p_email_list: emailList });

/** Maps a refusal to a message, without showing the database's wording. */
export function blogErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    TITLE_REQUIRED: "titleRequired",
    TOO_LONG: "tooLong",
    POST_INCOMPLETE: "incomplete",
    PUBLISH_DATE_IN_PAST: "pastDate",
    CATEGORY_EXISTS: "categoryExists",
    CATEGORY_INVALID: "categoryInvalid",
    POST_NOT_EDITABLE: "archived",
    COVER_NEEDED: "coverNeeded",
    CONTENT_INVALID: "contentInvalid",
    IMAGE_NOT_UPLOADED: "imageNotUploaded",
    IMAGE_LIMIT_REACHED: "imageLimit",
    NOT_AUTHORIZED: "notAllowed",
  };
  if (error.message && known[error.message]) return known[error.message];
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000" || error.code === "P0002") return "changed";
  return "generic";
}
