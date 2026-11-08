import { NextResponse } from "next/server";
import { z } from "zod";
import { destroyAsset } from "@/modules/media-management/cloudinary";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return fail(404, "IMAGE_NOT_FOUND");

  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");

  const { data: publicId, error } = await supabase.rpc("remove_vehicle_image", { p_asset_id: id.data });
  if (error) return failFromDatabase(error);

  // The photo has already left the site, so a failure here only leaves an unused file.
  if (publicId) await destroyAsset(publicId).catch((failure) => console.error("Could not delete image file", failure));
  return new NextResponse(null, { status: 204 });
}
