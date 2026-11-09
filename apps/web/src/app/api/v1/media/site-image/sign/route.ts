import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfigured, signSiteImageUpload } from "@/modules/media-management/cloudinary";
import type { MediaLimits } from "@/modules/media-management/rules";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { siteImageSlotSchema } from "@/modules/site-images";

const bodySchema = z.object({ slot: siteImageSlotSchema });

// Gives permission for one front-page photo, once the database agrees this is Super Admin.
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");
  if (!isConfigured()) return fail(503, "MEDIA_NOT_CONFIGURED");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { data, error } = await supabase.rpc("authorize_site_image", { p_slot: body.data.slot });
  if (error) return failFromDatabase(error);
  const limits = data as MediaLimits;
  return NextResponse.json({ data: { ...signSiteImageUpload(body.data.slot, limits), limits } });
}
