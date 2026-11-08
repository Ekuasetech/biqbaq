import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { destinationKind } from "./select";

export const AD_FILTERS = ["all", "live", "scheduled", "off", "ended"] as const;
export const SITE_PLACEMENTS = ["homepage", "global"] as const;

// Error values are keys into the adsAdmin.errors messages. The database applies the same rules.
export const adSchema = z
  .object({
    title: z.string().trim().min(1, "required").max(120, "tooLong"),
    advertiser: z.string().trim().min(1, "required").max(100, "tooLong"),
    description: z.string().trim().max(2000, "tooLong"),
    destination: z.string().trim().max(2000, "tooLong").refine((url) => destinationKind(url) !== "invalid", "destinationInvalid"),
    placements: z.array(z.enum(SITE_PLACEMENTS)).min(1, "placementRequired"),
    priority: z.coerce.number().int("priorityInvalid").min(0, "priorityInvalid").max(1000, "priorityInvalid"),
    startsAt: z.string().min(1, "datesInvalid"),
    endsAt: z.string().min(1, "datesInvalid"),
  })
  .refine((ad) => new Date(ad.endsAt).getTime() > new Date(ad.startsAt).getTime(), { message: "datesInvalid", path: ["endsAt"] });
export type AdForm = z.infer<typeof adSchema>;

export type AdState = "live" | "scheduled" | "off" | "ended";

export function adState(ad: { active: boolean; starts_at: string; ends_at: string }, now = Date.now()): AdState {
  if (new Date(ad.ends_at).getTime() <= now) return "ended";
  if (!ad.active) return "off";
  return new Date(ad.starts_at).getTime() > now ? "scheduled" : "live";
}

export interface AdminAdRow {
  id: string;
  slug: string;
  title: string;
  advertiser_name: string;
  image_url: string | null;
  placements: string[];
  priority: number;
  active: boolean;
  starts_at: string;
  ends_at: string;
  updated_at: string;
  total: number;
}

export interface EditableAd {
  id: string;
  slug: string;
  title: string;
  description: string;
  advertiser_name: string;
  image_url: string | null;
  destination_url: string;
  placements: string[];
  priority: number;
  active: boolean;
  starts_at: string;
  ends_at: string;
}

// Every function here is also checked by the database, whatever this code or the page does.

export async function hasAdsAccess(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("my_ads_access");
  return !error && data === true;
}
export const listAds = (supabase: SupabaseClient, filter: string, search: string, page: number, pageSize: number) =>
  supabase.rpc("admin_list_ads", { p_status: filter === "all" ? null : filter, p_search: search || null, p_limit: pageSize, p_offset: (page - 1) * pageSize });
export const getAd = (supabase: SupabaseClient, id: string) => supabase.rpc("get_ad_for_editing", { p_id: id });
export const saveAd = (supabase: SupabaseClient, id: string | null, form: AdForm) =>
  supabase.rpc("save_ad", {
    p_id: id,
    p_title: form.title,
    p_description: form.description,
    p_advertiser: form.advertiser,
    p_destination: form.destination,
    p_placements: form.placements,
    p_priority: form.priority,
    p_starts_at: new Date(form.startsAt).toISOString(),
    p_ends_at: new Date(form.endsAt).toISOString(),
  });
export const setAdActive = (supabase: SupabaseClient, id: string, active: boolean) => supabase.rpc("set_ad_active", { p_id: id, p_active: active });

/** Through the server, which deletes the ad's photo from Cloudinary too. */
export async function deleteAd(id: string): Promise<{ error: { message?: string } | null }> {
  const response = await fetch(`/api/v1/ads/${id}`, { method: "DELETE" }).catch(() => null);
  if (response?.ok) return { error: null };
  const json = await response?.json().catch(() => null);
  return { error: { message: json?.error?.code ?? "GENERIC" } };
}

/** Maps a refusal to a message, without showing the database's wording. */
export function adErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    DETAILS_REQUIRED: "required",
    DETAILS_INVALID: "invalid",
    DATES_INVALID: "datesInvalid",
    AD_INCOMPLETE: "needsImage",
    NOT_AUTHORIZED: "notAllowed",
  };
  if (error.message && known[error.message]) return known[error.message];
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000" || error.code === "P0002") return "changed";
  return "generic";
}
