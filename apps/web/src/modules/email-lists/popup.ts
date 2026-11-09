import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * The sign-up pop-up on public pages (owner's request of 2026-11-08). Super Admin edits its
 * words and the address told about sign-ups; the database checks every change.
 */
export interface PopupContent {
  enabled: boolean;
  message: { en: string; fr: string };
  button: { en: string; fr: string };
}

export const POPUP_DEFAULTS: PopupContent = {
  enabled: true,
  message: { en: "Subscribe to get good deals with Biqbaq", fr: "Abonnez-vous pour profiter de bonnes affaires avec Biqbaq" },
  button: { en: "Subscribe", fr: "S'abonner" },
};

export const POPUP_MESSAGE_MAX = 200;
export const POPUP_BUTTON_MAX = 30;
/** Shown this long after a visitor arrives (10 seconds, owner's request). */
export const POPUP_DELAY_MS = 10_000;
/** After closing it, a visitor does not see it again for this long. */
export const POPUP_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
export const POPUP_STORAGE_KEY = "biqbaq.subscribePopup";

const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

/** The pop-up's public settings, falling back to the defaults for anything missing. */
export function popupFromSettings(rows: { key: string; value: unknown }[]): PopupContent {
  const get = (key: string) => rows.find((row) => row.key === `subscribe_popup.${key}`)?.value;
  return {
    enabled: get("enabled") !== false,
    message: { en: text(get("message_en"), POPUP_DEFAULTS.message.en), fr: text(get("message_fr"), POPUP_DEFAULTS.message.fr) },
    button: { en: text(get("button_en"), POPUP_DEFAULTS.button.en), fr: text(get("button_fr"), POPUP_DEFAULTS.button.fr) },
  };
}

export async function getPopupContent(supabase: SupabaseClient): Promise<PopupContent | null> {
  const { data, error } = await supabase.from("public_platform_settings").select("key, value").like("key", "subscribe_popup.%");
  if (error) return null;
  return popupFromSettings((data ?? []) as { key: string; value: unknown }[]);
}

/** For Super Admin: the public settings and the private address told about sign-ups. */
export async function getPopupSettings(supabase: SupabaseClient): Promise<(PopupContent & { notifyEmail: string }) | null> {
  const { data, error } = await supabase.from("platform_settings").select("key, value").like("key", "subscribe_popup.%");
  if (error || !data) return null;
  const rows = data as { key: string; value: unknown }[];
  return { ...popupFromSettings(rows), notifyEmail: text(rows.find((row) => row.key === "subscribe_popup.notify_email")?.value, "") };
}

export const savePopupSettings = (
  supabase: SupabaseClient,
  settings: PopupContent & { notifyEmail: string },
  reason: string,
) =>
  supabase.rpc("admin_set_subscribe_popup", {
    p_enabled: settings.enabled,
    p_message_en: settings.message.en,
    p_message_fr: settings.message.fr,
    p_button_en: settings.button.en,
    p_button_fr: settings.button.fr,
    p_notify_email: settings.notifyEmail,
    p_reason: reason,
  });

export const popupSignupSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).email(),
  locale: z.enum(["en", "fr"]).catch("en"),
});

/**
 * Whether to offer the pop-up, from what this browser remembers: never again after signing
 * up, and not for 30 days after closing it.
 */
export function popupIsDue(stored: string | null, now: number): boolean {
  if (!stored) return true;
  try {
    const value = JSON.parse(stored) as { subscribed?: boolean; closedAt?: number };
    if (value.subscribed) return false;
    if (typeof value.closedAt === "number" && now - value.closedAt < POPUP_SNOOZE_MS) return false;
  } catch {
    // Unreadable, so treated as nothing remembered.
  }
  return true;
}

/** Pages where the pop-up would get in the way: signing in, and links from emails. */
const QUIET_PATHS = ["/sign-in", "/register", "/forgot-password", "/reset-password", "/email"];
export const popupAllowedOn = (pathname: string) => !QUIET_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const ERRORS = new Set(["EMAIL_INVALID", "RATE_LIMITED", "POPUP_OFF"]);
export const popupErrorKey = (code: string | undefined) => (code && ERRORS.has(code) ? code : "GENERIC");
