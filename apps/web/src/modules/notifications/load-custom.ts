import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { customFromRows, NO_CUSTOM, type EmailCustom } from "./custom";

let cached: { at: number; value: EmailCustom } | null = null;
const FRESH_MS = 30_000;

/**
 * Super Admin's email wording and welcome photos, read with the server's key. Kept for 30
 * seconds, so a run of emails reads it once. If it cannot be read, the built-in wording is
 * used: an email is never held back for this.
 */
export async function loadEmailCustom(): Promise<EmailCustom> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  const supabase = getSupabaseAdminClient();
  const [texts, images] = await Promise.all([
    supabase.from("email_texts").select("template, locale, field, value"),
    supabase.from("site_images").select("slot, image_url").in("slot", ["email_welcome_hero", "email_tile_products", "email_tile_cargo"]),
  ]);
  if (texts.error || images.error) {
    console.error("Email wording could not be read; using the built-in wording");
    return NO_CUSTOM;
  }
  const photo = (slot: string) => (images.data as { slot: string; image_url: string }[]).find((row) => row.slot === slot)?.image_url;
  const value = customFromRows(texts.data as { template: string; locale: string; field: string; value: string }[], {
    hero: photo("email_welcome_hero"),
    products: photo("email_tile_products"),
    cargo: photo("email_tile_cargo"),
  });
  cached = { at: Date.now(), value };
  return value;
}

/** After Super Admin saves, the next email uses the new wording at once. */
export const forgetEmailCustom = () => {
  cached = null;
};
