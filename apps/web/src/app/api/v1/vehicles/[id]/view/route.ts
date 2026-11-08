import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isBot, visitorKey } from "@/modules/product-catalog/views";
import { clientAddress, hashForLog } from "@/modules/seller-contact/server";

// Always answers the same way, so it tells nobody whether a view was counted.
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userAgent = request.headers.get("user-agent");
  const secret = process.env.CONTACT_HASH_SECRET;
  if (!z.uuid().safeParse(id).success || isBot(userAgent) || !secret) return done();

  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  const address = clientAddress(request.headers);
  const { error } = await getSupabaseAdminClient().rpc("record_vehicle_view", {
    p_listing: id,
    p_visitor_hash: hashForLog(secret, visitorKey(data.user?.id ?? null, address, userAgent ?? "")),
    p_ip_hash: hashForLog(secret, address),
    p_viewer: data.user?.id ?? null,
  });
  if (error) console.error("Could not count a view", error.code);
  return done();
}
