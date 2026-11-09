import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { docImages, docText, tryCleanDoc } from "@/modules/blog/rich-text";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";

const bodySchema = z.object({ contentEn: z.unknown(), contentFr: z.unknown().nullable(), published: z.boolean() });

/**
 * Saves the About us page. Each write-up is rebuilt from what Biqbaq allows, as for blog
 * posts; it has its own photo, so photos inside the text are refused. The database checks
 * that this is Super Admin.
 */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "CONTENT_INVALID");
  const english = tryCleanDoc(body.data.contentEn);
  const french = body.data.contentFr === null ? null : tryCleanDoc(body.data.contentFr);
  if (!english || (body.data.contentFr !== null && !french)) return fail(400, "CONTENT_INVALID");
  if (docImages(english).length > 0 || (french && docImages(french).length > 0)) return fail(400, "PHOTOS_NOT_ALLOWED");
  const frenchText = french ? docText(french).trim() : "";

  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { error } = await supabase.rpc("admin_save_about_page", {
    p_content_en: english,
    // An empty French version is not kept, so French visitors read the English.
    p_content_fr: frenchText ? french : null,
    p_text_en: docText(english),
    p_text_fr: frenchText,
    p_published: body.data.published,
  });
  if (error) return failFromDatabase(error);
  // The footer link and the page change at once.
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  return new NextResponse(null, { status: 204 });
}
