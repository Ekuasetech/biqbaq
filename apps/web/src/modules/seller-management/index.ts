import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { VerificationStatus } from "@/modules/verification";

export interface MyShop {
  id: string;
  slug: string;
  name: string;
  city: string;
  category: string | null;
  description: string;
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
    .select("id, slug, name, city, category, description, status, publishing_suspended, verification_status")
    .eq("owner_user_id", userId)
    .maybeSingle();
}

const SHOP_COLUMNS = "id, slug, name, city, category, description, status, publishing_suspended, verification_status";

/** A shop this person works for as staff. Security rules hide any other. */
export async function getShopById(supabase: SupabaseClient, sellerId: string) {
  return supabase.from("sellers").select(SHOP_COLUMNS).eq("id", sellerId).maybeSingle();
}

export async function getMyAllowance(supabase: SupabaseClient) {
  return supabase.rpc("my_publishing_allowance");
}

/** How many more products can go live. Null means no limit. */
export function placesLeft({ verified, used, allowance }: PublishingAllowance): number | null {
  return verified ? null : Math.max(0, allowance - used);
}

// Error values are keys into the shop.errors messages. These help people fill in the
// form: the database applies the same rules, and has the final say.
const required = (max: number) => z.string("required").trim().min(1, "required").max(max, "tooLong");

export const shopProfileSchema = z.object({
  name: required(150),
  city: required(100),
  category: required(100),
  description: required(1000),
  contact_information: required(200),
});
export type ShopProfile = z.infer<typeof shopProfileSchema>;

/** The private contact details, which only the owner and managers can read. */
export async function getMyContactInformation(supabase: SupabaseClient, sellerId: string) {
  return supabase.from("seller_private").select("contact_information").eq("seller_id", sellerId).maybeSingle();
}

export const updateMyShop = (supabase: SupabaseClient, profile: ShopProfile) =>
  supabase.rpc("update_my_shop", {
    p_name: profile.name,
    p_city: profile.city,
    p_category: profile.category,
    p_description: profile.description,
    p_contact_information: profile.contact_information,
  });

/** Maps a refusal to a message, without showing the database's wording. */
export function shopProfileErrorKey(error: { code?: string; message?: string }): string {
  if (error.message === "DETAILS_REQUIRED" || error.message === "CATEGORY_NOT_FOUND") return "required";
  if (error.message === "DETAILS_TOO_LONG") return "tooLong";
  return error.code === "42501" ? "notAllowed" : "generic";
}
