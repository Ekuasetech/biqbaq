import { NextResponse } from "next/server";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { emailCatalog } from "@/modules/notifications/catalog";

/** Every email Super Admin can reword, with its built-in wording and what they saved. */
export async function GET() {
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  // Also the check that this is Super Admin.
  const { data, error } = await supabase.rpc("admin_list_email_texts");
  if (error) return failFromDatabase(error);
  return NextResponse.json({ data: { emails: emailCatalog(), saved: data ?? [] } });
}
