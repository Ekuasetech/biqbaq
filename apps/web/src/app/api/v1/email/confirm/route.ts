import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { badLink, tokenFrom } from "@/modules/email-lists/tokens";

// Confirming takes a button press on the page, never just opening the link, because
// mail scanners open links on their own (Q-42).
export async function POST(request: Request) {
  const token = await tokenFrom(request);
  if (!token) return badLink();
  const { data, error } = await getSupabaseAdminClient().rpc("confirm_list_token", { p_token: token });
  if (error) return badLink();
  return NextResponse.json({ status: data as string });
}
