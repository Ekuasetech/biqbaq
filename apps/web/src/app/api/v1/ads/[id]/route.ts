import { NextResponse } from "next/server";
import { z } from "zod";
import { destroyAsset } from "@/modules/media-management/cloudinary";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";

// The database decides first. Only then is the photo deleted, so nobody can delete another's file.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "AD_NOT_FOUND");
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { data, error } = await supabase.rpc("delete_ad", { p_id: id });
  if (error) return failFromDatabase(error);
  if (typeof data === "string") await destroyAsset(data).catch(() => console.error("Could not delete an ad photo"));
  return new NextResponse(null, { status: 204 });
}
