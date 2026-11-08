import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { badLink, tokenFrom } from "@/modules/email-lists/tokens";

/** Whose list a link belongs to, and whether it is confirmed, for the confirm and unsubscribe pages. */
export async function POST(request: Request) {
  const token = await tokenFrom(request);
  if (!token) return badLink();
  const { data, error } = await getSupabaseAdminClient().rpc("lookup_list_token", { p_token: token });
  const row = (data as { sender_name: string; status: string }[] | null)?.[0];
  if (error || !row) return badLink();
  return NextResponse.json({ sender: row.sender_name, status: row.status });
}
