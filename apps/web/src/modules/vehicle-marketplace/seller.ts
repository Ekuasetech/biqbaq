import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const MAX_RESTRICTIONS = 10;

// Error values are keys into the shopVehicles.errors messages. The database applies the same rules.
export const vehicleSchema = z.object({
  make: z.string().trim().min(1, "required").max(40, "tooLong"),
  model: z.string().trim().min(1, "required").max(60, "tooLong"),
  year: z.coerce.number({ error: "yearInvalid" }).int("yearInvalid").min(1980, "yearInvalid").max(new Date().getFullYear() + 1, "yearInvalid"),
  origin: z.string().trim().min(1, "required").max(80, "tooLong"),
  destination: z.string().trim().min(1, "required").max(80, "tooLong"),
  departure: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "departureInvalid"),
  availableKg: z.coerce.number({ error: "kgInvalid" }).int("kgInvalid").min(0, "kgInvalid").max(100000, "kgInvalid"),
  restrictions: z.array(z.string().trim().min(1).max(120, "tooLong")).max(MAX_RESTRICTIONS, "tooManyRestrictions"),
  cargoStatus: z.enum(["accepting_cargo", "full"]),
});
export type VehicleForm = z.infer<typeof vehicleSchema>;

/** One restriction per line. Blank lines are dropped. */
export const parseRestrictions = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export interface MyVehicle {
  id: string;
  slug: string;
  make: string;
  model: string;
  year: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  available_kg: number;
  restrictions: string[];
  cargo_status: "accepting_cargo" | "full";
  status: "draft" | "published" | "unpublished" | "archived" | "suspended";
  views: number;
  photos: { id: string; secure_url: string; is_primary: boolean; display_order: number; entity_id: string }[];
  is_public: boolean;
}

// Every function here is also checked by the database, whatever this code or the page does.

export const listMyVehicles = (supabase: SupabaseClient) => supabase.rpc("my_vehicle_listings");
export const saveVehicle = (supabase: SupabaseClient, id: string | null, form: VehicleForm) =>
  supabase.rpc("save_vehicle_listing", {
    p_id: id,
    p_make: form.make,
    p_model: form.model,
    p_year: form.year,
    p_origin: form.origin,
    p_destination: form.destination,
    p_departure: form.departure,
    p_available_kg: form.availableKg,
    p_restrictions: form.restrictions,
    p_cargo_status: form.cargoStatus,
  });
export const publishVehicle = (supabase: SupabaseClient, id: string) => supabase.rpc("publish_vehicle_listing", { p_id: id });
export const unpublishVehicle = (supabase: SupabaseClient, id: string) => supabase.rpc("unpublish_vehicle_listing", { p_id: id });
export const deleteVehicle = (supabase: SupabaseClient, id: string) => supabase.rpc("delete_vehicle_listing", { p_id: id });
export const makeMainVehiclePhoto = (supabase: SupabaseClient, id: string) => supabase.rpc("make_vehicle_image_primary", { p_asset_id: id });

/** Maps a refusal to a message, without showing the database's wording. */
export function vehicleErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    VERIFICATION_REQUIRED: "verificationRequired",
    DEPARTURE_IN_PAST: "departureInvalid",
    DETAILS_INVALID: "invalid",
    LISTING_INCOMPLETE: "needsPhoto",
    SELLER_PUBLISHING_SUSPENDED: "publishingSuspended",
    LISTING_NOT_PUBLISHABLE: "changed",
    LISTING_NOT_PUBLISHED: "changed",
    LISTING_NOT_EDITABLE: "notEditable",
    LISTING_SUSPENDED: "notEditable",
    LAST_PHOTO: "lastPhoto",
  };
  if (error.message && known[error.message]) return known[error.message];
  return error.code === "42501" ? "notAllowed" : "generic";
}
