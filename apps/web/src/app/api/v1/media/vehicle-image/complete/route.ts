import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { destroyAsset, fetchAsset, isCloudinaryUrl, isConfigured, mediaRoot } from "@/modules/media-management/cloudinary";
import { assetProblem, isOwnVehicleImage, type MediaLimits } from "@/modules/media-management/rules";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

const bodySchema = z.object({ listingId: z.uuid(), publicId: z.string().max(300) });
const discard = (publicId: string) => destroyAsset(publicId).catch(() => console.error("Could not delete an image"));

// The same checks as every other photo: the real file is confirmed with Cloudinary before it is saved.
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");
  if (!isConfigured()) return fail(503, "MEDIA_NOT_CONFIGURED");
  const { listingId, publicId } = body.data;
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const allowed = await supabase.rpc("authorize_vehicle_image", { p_id: listingId });
  const ownFile = isOwnVehicleImage(publicId, mediaRoot(), listingId);
  if (allowed.error) {
    // The person controls this listing, but it has filled up or been suspended meanwhile.
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
  const saved = await getSupabaseAdminClient().rpc("record_vehicle_image", { p_actor: user.id, p_id: listingId, p_public_id: publicId, p_secure_url: asset.secure_url });
  if (saved.error) {
    await discard(publicId);
    return failFromDatabase(saved.error);
  }
  return NextResponse.json({ data: { id: saved.data } }, { status: 201 });
}
