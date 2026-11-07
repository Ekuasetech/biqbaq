import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerificationStatus } from "@/modules/verification";

export interface MyShop {
  id: string;
  slug: string;
  name: string;
  city: string;
  status: "active" | "suspended";
  publishing_suspended: boolean;
  verification_status: VerificationStatus;
}

export interface PublishingAllowance {
  verified: boolean;
  used: number;
  allowance: number;
}

/** The signed-in person's shop, if they have one. Security rules hide all others. */
export async function getMyShop(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("sellers")
    .select("id, slug, name, city, status, publishing_suspended, verification_status")
    .eq("owner_user_id", userId)
    .maybeSingle();
}

export async function getMyAllowance(supabase: SupabaseClient) {
  return supabase.rpc("my_publishing_allowance");
}

/** How many more products can go live. Null means no limit. */
export function placesLeft({ verified, used, allowance }: PublishingAllowance): number | null {
  return verified ? null : Math.max(0, allowance - used);
}
