import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfigured, signAdImageUpload } from "@/modules/media-management/cloudinary";
import type { MediaLimits } from "@/modules/media-management/rules";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

const bodySchema = z.object({ adId: z.uuid() });

// Gives permission for one ad photo, once the database agrees this person manages ads.
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");
  if (!isConfigured()) return fail(503, "MEDIA_NOT_CONFIGURED");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { data, error } = await supabase.rpc("authorize_ad_image", { p_id: body.data.adId });
  if (error) return failFromDatabase(error);
  const limits = data as MediaLimits;
  return NextResponse.json({ data: { ...signAdImageUpload(body.data.adId, limits), limits } });
}
