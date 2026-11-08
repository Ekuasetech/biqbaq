import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { destroyAsset } from "@/modules/media-management/cloudinary";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { postSchema } from "@/modules/blog/admin";
import { docImages, docText, tryCleanDoc } from "@/modules/blog/rich-text";

const requestSchema = postSchema.omit({ body: true }).extend({ id: z.uuid().nullable(), content: z.unknown() });

// A photo uploaded in the last few minutes may be waiting to be saved into the article.
const FRESH_MS = 10 * 60 * 1000;

/**
 * Saves a post. The article is rebuilt from what Biqbaq allows, its photos must be ones uploaded
 * to this post, and photos it no longer uses are deleted. The database still checks who may save.
 */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message === "titleRequired" ? "TITLE_REQUIRED" : "INVALID_REQUEST");
  const { id, content, ...form } = parsed.data;
  const doc = tryCleanDoc(content);
  if (!doc) return fail(400, "CONTENT_INVALID");

  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");

  const used = docImages(doc);
  const admin = getSupabaseAdminClient();
  const stored = id ? await admin.rpc("blog_post_images", { p_post: id }) : { data: [], error: null };
  if (stored.error) return fail(500, "GENERIC");
  const images = (stored.data ?? []) as { id: string; public_id: string; url: string; created_at: string }[];
  if (used.some((url) => !images.some((image) => image.url === url))) return fail(400, "IMAGE_NOT_UPLOADED");

  const body = docText(doc);
  const { data, error } = await supabase.rpc("save_blog_post", {
    p_id: id,
    p_title: form.title,
    p_excerpt: form.excerpt,
    p_body: body,
    p_category: form.category,
    p_tags: form.tags,
    p_author_name: form.author,
    p_seo_title: form.seoTitle,
    p_seo_description: form.seoDescription,
    p_content: doc,
  });
  if (error) return failFromDatabase(error);

  // Only after the database agreed this person may save this post.
  const unused = images.filter((image) => !used.includes(image.url) && Date.now() - new Date(image.created_at).getTime() > FRESH_MS);
  if (unused.length > 0) {
    await Promise.all(unused.map((image) => destroyAsset(image.public_id).catch(() => console.error("Could not delete an unused photo"))));
    await admin.rpc("forget_blog_images", { p_post: data as string, p_ids: unused.map((image) => image.id) });
  }
  return NextResponse.json({ data: { id: data } });
}
