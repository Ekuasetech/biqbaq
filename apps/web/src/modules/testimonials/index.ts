import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "What customers say" on the front page, written by Super Admin (owner's request,
 * 2026-11-08): each quote has the customer's words, name and city. The database checks
 * every change and lets only Super Admin make it.
 */
export const TESTIMONIAL_QUOTE_MAX = 500;
export const TESTIMONIAL_NAME_MAX = 80;
export const TESTIMONIAL_CITY_MAX = 80;

export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  city: string;
}

export interface AdminTestimonial extends Testimonial {
  published: boolean;
  sort_order: number;
  updated_at: string;
}

export const listTestimonialsForAdmin = (supabase: SupabaseClient) => supabase.rpc("admin_list_testimonials");
export const saveTestimonial = (supabase: SupabaseClient, id: string | null, value: { quote: string; name: string; city: string; published: boolean }) =>
  supabase.rpc("admin_save_testimonial", { p_id: id, p_quote: value.quote, p_name: value.name, p_city: value.city, p_published: value.published });
export const deleteTestimonial = (supabase: SupabaseClient, id: string) => supabase.rpc("admin_delete_testimonial", { p_id: id });
export const moveTestimonial = (supabase: SupabaseClient, id: string, direction: -1 | 1) =>
  supabase.rpc("admin_move_testimonial", { p_id: id, p_direction: direction });

const ERRORS = new Set(["DETAILS_INVALID", "TOO_MANY", "TESTIMONIAL_NOT_FOUND"]);
export const testimonialErrorKey = (error: { message?: string } | null) => (error?.message && ERRORS.has(error.message) ? error.message : "GENERIC");

/**
 * The quotes slide only when there are more than three (owner's choice); up to three sit
 * still, side by side, each shown once.
 */
export const TESTIMONIALS_STILL_MAX = 3;
export const testimonialsSlide = (count: number) => count > TESTIMONIALS_STILL_MAX;
