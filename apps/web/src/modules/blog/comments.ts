import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const COMMENT_MAX_LENGTH = 2000;

export const commentSchema = z.object({
  body: z.string().trim().min(1, "required").max(COMMENT_MAX_LENGTH, "tooLong"),
});

export interface BlogComment {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
}

export interface CommentForModeration {
  id: string;
  post_title: string;
  post_slug: string;
  author_name: string | null;
  author_email: string | null;
  body: string;
  status: "published" | "hidden";
  hidden_reason: string | null;
  created_at: string;
  total: number;
}

// Every function here is also checked by the database, whatever this code or the page does.

/** Read fresh rather than cached, so a new comment shows straight away. */
export const listComments = (supabase: SupabaseClient, postId: string) =>
  supabase.from("public_blog_comments").select("id, body, created_at, author_name").eq("post_id", postId).order("created_at").limit(500);
export const myCommentIds = (supabase: SupabaseClient, postId: string) => supabase.rpc("my_blog_comment_ids", { p_post: postId });
export const addComment = (supabase: SupabaseClient, postId: string, body: string) => supabase.rpc("add_blog_comment", { p_post: postId, p_body: body });
export const deleteMyComment = (supabase: SupabaseClient, id: string) => supabase.rpc("delete_my_blog_comment", { p_comment: id });
export const listCommentsForModeration = (supabase: SupabaseClient, status: string, search: string, page: number, pageSize: number) =>
  supabase.rpc("admin_list_blog_comments", { p_status: status === "all" ? null : status, p_search: search || null, p_limit: pageSize, p_offset: (page - 1) * pageSize });
export const setCommentHidden = (supabase: SupabaseClient, id: string, hidden: boolean, reason: string) =>
  supabase.rpc("set_blog_comment_hidden", { p_comment: id, p_hidden: hidden, p_reason: reason });

/** Maps a refusal to a message, without showing the database's wording. */
export function commentErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    COMMENT_REQUIRED: "required",
    COMMENT_TOO_LONG: "tooLong",
    COMMENTS_DISABLED: "disabled",
    RATE_LIMITED: "rateLimited",
    POST_NOT_FOUND: "unavailable",
  };
  return (error.message && known[error.message]) || "generic";
}
