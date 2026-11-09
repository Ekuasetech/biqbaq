import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { destroyAsset } from "@/modules/media-management/cloudinary";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { SITE_IMAGE_ALT_MAX, siteImageSlotSchema } from "@/modules/site-images";

type Context = { params: Promise<{ slot: string }> };
const altSchema = z.object({ altEn: z.string().max(SITE_IMAGE_ALT_MAX), altFr: z.string().max(SITE_IMAGE_ALT_MAX) });

/** Super Admin changes what a screen reader says about an uploaded front-page photo. */
export async function PATCH(request: Request, { params }: Context) {
  const slot = siteImageSlotSchema.safeParse((await params).slot);
  const body = altSchema.safeParse(await request.json().catch(() => null));
  if (!slot.success || !body.success) return fail(400, "DETAILS_INVALID");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { error } = await supabase.rpc("admin_set_site_image_alt", { p_slot: slot.data, p_alt_en: body.data.altEn, p_alt_fr: body.data.altFr });
  if (error) return failFromDatabase(error);
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  return new NextResponse(null, { status: 204 });
}

/** Super Admin puts a slot back to the photo the site ships with; the upload is deleted. */
export async function DELETE(_request: Request, { params }: Context) {
  const slot = siteImageSlotSchema.safeParse((await params).slot);
  if (!slot.success) return fail(404, "SLOT_NOT_FOUND");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { data, error } = await supabase.rpc("admin_reset_site_image", { p_slot: slot.data });
  if (error) return failFromDatabase(error);
  if (typeof data === "string") await destroyAsset(data).catch(() => console.error("Could not delete an image"));
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  return new NextResponse(null, { status: 204 });
}
