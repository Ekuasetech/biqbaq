import type { SupabaseClient } from "@supabase/supabase-js";

export type SettingKind = "toggle" | "number" | "megabytes" | "formats";

export interface SettingDefinition {
  key: string;
  /** Used for its labels in the settings.items messages, as message keys cannot contain dots. */
  id: string;
  kind: SettingKind;
  min?: number;
  max?: number;
}

export const FORMATS = ["jpg", "png", "webp"] as const;
const MEGABYTE = 1024 * 1024;

// Only settings that do something today. Others wait for the feature they control, so
// nothing here looks like a working switch when it is not. The database has its own limits
// and the final say, and these must match them.
export const SETTING_GROUPS: { id: string; settings: SettingDefinition[] }[] = [
  {
    id: "publishing",
    settings: [
      { key: "publishing.global_enabled", id: "publishingGlobal", kind: "toggle" },
      { key: "publishing.verified_enabled", id: "publishingVerified", kind: "toggle" },
      { key: "publishing.unverified_enabled", id: "publishingUnverified", kind: "toggle" },
      { key: "publishing.unverified_allowance", id: "unverifiedAllowance", kind: "number", min: 0, max: 1000 },
    ],
  },
  {
    id: "email",
    settings: [{ key: "email.notifications_enabled", id: "emailNotifications", kind: "toggle" }],
  },
  {
    id: "contact",
    settings: [
      { key: "contact.max_per_ip_hour", id: "contactPerIp", kind: "number", min: 1, max: 1000 },
      { key: "contact.max_per_email_hour", id: "contactPerEmail", kind: "number", min: 1, max: 1000 },
      { key: "contact.max_per_seller_hour", id: "contactPerSeller", kind: "number", min: 1, max: 100000 },
    ],
  },
  {
    id: "media",
    settings: [
      { key: "media.max_image_bytes", id: "maxImageSize", kind: "megabytes", min: 0.1, max: 10 },
      { key: "media.max_dimension", id: "maxDimension", kind: "number", min: 500, max: 10000 },
      { key: "media.max_images", id: "maxImages", kind: "number", min: 1, max: 20 },
      { key: "media.allowed_formats", id: "allowedFormats", kind: "formats" },
    ],
  },
];

export const findSetting = (key: string) => SETTING_GROUPS.flatMap((group) => group.settings).find((setting) => setting.key === key);

/** Turns what was typed or ticked into the stored value. Null means it is not acceptable. */
export function parseSettingInput(setting: SettingDefinition, input: string | string[] | boolean): unknown {
  if (setting.kind === "toggle") return typeof input === "boolean" ? input : null;
  if (setting.kind === "formats") {
    if (!Array.isArray(input) || input.length === 0) return null;
    return FORMATS.filter((format) => input.includes(format));
  }
  if (typeof input !== "string" || !/^\d+(\.\d+)?$/.test(input.trim())) return null;
  const number = Number(input);
  if (number < (setting.min ?? 0) || number > (setting.max ?? Infinity)) return null;
  if (setting.kind === "megabytes") return Math.round(number * MEGABYTE);
  return Number.isInteger(number) ? number : null;
}

/** The stored value in the form its input uses. */
export function settingInputValue(setting: SettingDefinition, value: unknown): string {
  if (setting.kind === "megabytes" && typeof value === "number") return String(Math.round((value / MEGABYTE) * 100) / 100);
  return String(value);
}

export const listSettings = (supabase: SupabaseClient) => supabase.from("platform_settings").select("key, value, updated_at");

export const updateSetting = (supabase: SupabaseClient, key: string, value: unknown, reason: string) =>
  supabase.rpc("update_platform_setting", { p_key: key, p_value: value, p_reason: reason });

export interface SettingChange {
  id: string;
  key: string;
  old_value: unknown;
  new_value: unknown;
  actor_name: string | null;
  actor_email: string | null;
  reason: string | null;
  created_at: string;
}

export const listSettingHistory = (supabase: SupabaseClient) => supabase.rpc("admin_setting_history", { p_limit: 20 });

/** Maps a refusal to a message, without showing the database's wording. */
export function settingErrorKey(error: { code?: string; message?: string }): string {
  if (error.message === "REASON_REQUIRED") return "reasonRequired";
  if (error.message === "REASON_TOO_LONG") return "reasonTooLong";
  if (error.message === "SETTING_OUT_OF_RANGE" || error.message === "SETTING_WRONG_TYPE") return "invalidValue";
  return error.code === "42501" ? "notAllowed" : "generic";
}
