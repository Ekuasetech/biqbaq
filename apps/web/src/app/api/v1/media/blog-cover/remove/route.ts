import { NextResponse } from "next/server";
import { z } from "zod";
import { destroyAsset, isConfigured } from "@/modules/media-management/cloudinary";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

const bodySchema = z.object({ postId: z.uuid() });

// The database decides first. Only then is the file deleted, so nobody can delete another's file.
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");
  if (!isConfigured()) return fail(503, "MEDIA_NOT_CONFIGURED");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { data, error } = await supabase.rpc("clear_blog_cover", { p_post: body.data.postId });
  if (error) return failFromDatabase(error);
  if (typeof data === "string") await destroyAsset(data).catch(() => console.error("Could not delete a cover photo"));
  return new NextResponse(null, { status: 204 });
}
