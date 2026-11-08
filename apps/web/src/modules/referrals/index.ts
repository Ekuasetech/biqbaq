import type { SupabaseClient } from "@supabase/supabase-js";

// Referrals (PRD §14). The database decides whether a code earns credit; this remembers
// which link someone opened and shows the owners their figures.

export const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;
/** The latest link opened gets the credit, for 30 days (BD-11). */
export const REFERRAL_DAYS = 30;
export const REFERRAL_COOKIE = "biqbaq_ref";

export const normalizeCode = (value: string | null | undefined) => {
  const code = (value ?? "").trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
};

export interface RememberedReferral {
  code: string;
  openedAt: string;
}

/** The cookie's value: the code and when its link was opened. */
export const serializeReferral = (code: string, openedAt: Date) => `${code}.${openedAt.getTime()}`;

export function parseReferral(value: string | null | undefined, now = new Date()): RememberedReferral | null {
  const [rawCode, rawTime] = (value ?? "").split(".");
  const code = normalizeCode(rawCode);
  const time = Number(rawTime);
  if (!code || !Number.isFinite(time)) return null;
  if (now.getTime() - time > REFERRAL_DAYS * 86400000 || time > now.getTime() + 60000) return null;
  return { code, openedAt: new Date(time).toISOString() };
}

export const referralUrl = (origin: string, code: string, locale = "en") =>
  `${origin.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}/register?ref=${code}`;

function readCookie(): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${REFERRAL_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(REFERRAL_COOKIE.length + 1)) : null;
}

/** Remembers a ?ref= code from the address, replacing any earlier one (BD-11). */
export function rememberReferralFrom(search: string) {
  const code = normalizeCode(new URLSearchParams(search).get("ref"));
  if (!code) return;
  document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(serializeReferral(code, new Date()))}; max-age=${REFERRAL_DAYS * 86400}; path=/; samesite=lax`;
}

export const rememberedReferral = () => parseReferral(readCookie());

/** After signing up, so a later sign-up in the same browser is not credited too. */
export const forgetReferral = () => {
  document.cookie = `${REFERRAL_COOKIE}=; max-age=0; path=/; samesite=lax`;
};

export interface ReferralProgramme {
  code_id: string;
  code: string;
  owner_type: "marketer" | "seller";
  shop_name: string | null;
  total: number;
  today: number;
  this_week: number;
  this_month: number;
  waiting: number;
}

export interface ReferralSignup {
  registered_at: string;
  completed_at: string | null;
}

export interface AdminReferralCode {
  code_id: string;
  code: string;
  owner_type: "marketer" | "seller";
  owner_name: string;
  owner_email: string | null;
  shop_name: string | null;
  usable: boolean;
  total: number;
  this_month: number;
  waiting: number;
  total_count: number;
}

export const HISTORY_PAGE_SIZE = 20;
export const ADMIN_PAGE_SIZE = 20;

export const listMyProgrammes = (supabase: SupabaseClient) => supabase.rpc("my_referral_programmes");
export const listMyHistory = (supabase: SupabaseClient, codeId: string, before?: string) =>
  supabase.rpc("my_referral_history", { p_code_id: codeId, p_before: before ?? null, p_limit: HISTORY_PAGE_SIZE });
export const adminListCodes = (supabase: SupabaseClient, type: string, search: string, page: number) =>
  supabase.rpc("admin_list_referral_codes", {
    p_type: type === "all" ? null : type,
    p_search: search || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });
export const adminSetCode = (supabase: SupabaseClient, codeId: string, code: string) =>
  supabase.rpc("admin_set_referral_code", { p_code_id: codeId, p_code: code });

export function referralErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = { CODE_INVALID: "codeInvalid", CODE_TAKEN: "codeTaken", CODE_NOT_FOUND: "generic" };
  if (error.message && known[error.message]) return known[error.message];
  return error.code === "42501" ? "notAllowed" : "generic";
}
