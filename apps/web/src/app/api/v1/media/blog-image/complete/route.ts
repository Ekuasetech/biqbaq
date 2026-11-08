import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { destroyAsset, fetchAsset, isCloudinaryUrl, isConfigured, mediaRoot } from "@/modules/media-management/cloudinary";
import { assetProblem, isOwnBlogCover, type MediaLimits } from "@/modules/media-management/rules";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

const bodySchema = z.object({ postId: z.uuid(), publicId: z.string().max(300) });
const discard = (publicId: string) => destroyAsset(publicId).catch(() => console.error("Could not delete an image"));

// The same checks as every other photo: the real file is confirmed with Cloudinary before it is kept.
// It is recorded against the post, so the server can delete it once the article stops using it.
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");
  if (!isConfigured()) return fail(503, "MEDIA_NOT_CONFIGURED");
  const { postId, publicId } = body.data;
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");

  const allowed = await supabase.rpc("authorize_blog_image", { p_post: postId });
  const ownFile = isOwnBlogCover(publicId, mediaRoot(), postId);
  if (allowed.error) {
    if (ownFile && allowed.error.code === "55000") await discard(publicId);
    return failFromDatabase(allowed.error);
  }
  if (!ownFile) return fail(400, "IMAGE_REJECTED");
  const asset = await fetchAsset(publicId);
  if (!asset) return fail(400, "IMAGE_REJECTED");
  if (assetProblem(asset, allowed.data as MediaLimits) || !isCloudinaryUrl(asset.secure_url)) {
    await discard(publicId);
    return fail(400, "IMAGE_REJECTED");
  }
  const saved = await getSupabaseAdminClient().rpc("record_blog_image", { p_actor: user.id, p_post: postId, p_public_id: publicId, p_secure_url: asset.secure_url });
  if (saved.error) {
    await discard(publicId);
    return failFromDatabase(saved.error);
  }
  return NextResponse.json({ data: { url: asset.secure_url } }, { status: 201 });
}
