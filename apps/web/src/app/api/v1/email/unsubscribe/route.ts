import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { badLink, tokenFrom } from "@/modules/email-lists/tokens";

// Used by the unsubscribe page, and by mail apps' own unsubscribe button, which posts to
// the address in the email's List-Unsubscribe header (RFC 8058). Takes effect at once.
export async function POST(request: Request) {
  const token = await tokenFrom(request);
  if (!token) return badLink();
  const { error } = await getSupabaseAdminClient().rpc("unsubscribe_list_token", { p_token: token });
  if (error) return badLink();
  return NextResponse.json({ status: "unsubscribed" });
}
