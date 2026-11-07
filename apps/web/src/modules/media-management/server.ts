import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const fail = (status: number, code: string) => NextResponse.json({ error: { code, message: code, details: {} } }, { status });

const STATUS_BY_CODE: Record<string, number> = { "42501": 403, P0002: 404, "55000": 409, "23514": 400 };

/** Passes on the database's stable refusal codes, and hides anything unexpected. */
export function failFromDatabase(error: { code?: string; message: string }) {
  const status = error.code ? STATUS_BY_CODE[error.code] : undefined;
  if (!status) {
    console.error("Media request failed", error.code);
    return fail(500, "GENERIC");
  }
  return fail(status, /^[A-Z_]+$/.test(error.message) ? error.message : "NOT_AUTHORIZED");
}

/** A connection acting as the person who sent the request, and who that is. */
export async function currentUser() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}
