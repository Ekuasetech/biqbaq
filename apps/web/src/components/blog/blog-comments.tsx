"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { WriterAvatar } from "@/components/blog/blog-post-card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { addComment, COMMENT_MAX_LENGTH, commentErrorKey, commentSchema, deleteMyComment, listComments, myCommentIds, type BlogComment } from "@/modules/blog/comments";

const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-red px-4 text-sm font-semibold text-brand-red-foreground hover:bg-brand-red/90 disabled:opacity-60";

/** Comments are plain text from signed-in visitors, shown straight away (owner's decision, 2026-11-07). */
export function BlogComments({ postId }: { postId: string }) {
  const t = useTranslations("comments");
  const format = useFormatter();
  const user = useSessionUser();
  const [comments, setComments] = useState<BlogComment[] | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await listComments(supabase, postId);
    setComments((data ?? []) as BlogComment[]);
  }, [postId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      const { data } = await myCommentIds(getSupabaseBrowserClient(), postId);
      setMine(((data ?? []) as string[]).map(String));
    }, 0);
    return () => clearTimeout(timer);
  }, [user, postId, comments]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const parsed = commentSchema.safeParse({ body });
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await addComment(getSupabaseBrowserClient(), postId, parsed.data.body);
    if (error) setFailure(commentErrorKey(error));
    else {
      setBody("");
      await load();
    }
    setWorking(false);
  }

  async function remove(id: string) {
    const { error } = await deleteMyComment(getSupabaseBrowserClient(), id);
    if (error) setFailure(commentErrorKey(error));
    await load();
  }

  return (
    <section aria-labelledby="comments-title" className="mt-12 border-t border-border pt-8">
      <h2 id="comments-title" className="font-heading text-2xl font-bold tracking-tight">
        {t("title")}{comments && comments.length > 0 && ` (${comments.length})`}
      </h2>
      {comments === null ? null : comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {comments.map((comment) => {
            const name = comment.author_name ?? t("anonymous");
            return (
              <li key={comment.id} className="rounded-2xl bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <WriterAvatar name={name} className="size-6 text-[0.625rem]" />
                  <span className="font-semibold">{name}</span>
                  <time dateTime={comment.created_at} className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(comment.created_at), { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-sm">{comment.body}</p>
                {mine.includes(comment.id) && (
                  <button type="button" onClick={() => void remove(comment.id)} className="mt-2 text-xs font-semibold underline underline-offset-4">{t("delete")}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {user === undefined ? null : user ? (
        <form onSubmit={submit} noValidate aria-label={t("formLabel")} className="mt-5 grid gap-2">
          <Label htmlFor="comment-body">{t("yourComment")}</Label>
          <Textarea id="comment-body" value={body} rows={3} maxLength={COMMENT_MAX_LENGTH} onChange={(event) => setBody(event.target.value)} />
          <p className="text-xs text-muted-foreground">{t("publicHint")}</p>
          {failure && <p role="alert" className="text-sm text-destructive">{t(`errors.${failure}`)}</p>}
          <button type="submit" disabled={working} className={`${primaryButton} w-fit`}>{working ? t("posting") : t("post")}</button>
        </form>
      ) : (
        <p className="mt-5 text-sm">
          <Link href="/sign-in" className="font-semibold underline underline-offset-4">{t("signIn")}</Link> {t("signInToComment")}
        </p>
      )}
    </section>
  );
}
