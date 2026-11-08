import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfigured, signVehicleImageUpload } from "@/modules/media-management/cloudinary";
import type { MediaLimits } from "@/modules/media-management/rules";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

const bodySchema = z.object({ listingId: z.uuid() });

// Gives permission for one photo of a vehicle, once the database agrees this is the seller's own listing.
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");
  if (!isConfigured()) return fail(503, "MEDIA_NOT_CONFIGURED");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { data, error } = await supabase.rpc("authorize_vehicle_image", { p_id: body.data.listingId });
  if (error) return failFromDatabase(error);
  const limits = data as MediaLimits;
  return NextResponse.json({ data: { ...signVehicleImageUpload(body.data.listingId, limits), limits } });
}
