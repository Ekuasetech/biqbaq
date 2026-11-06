import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/safe-path";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Where confirmation and password reset emails land. Exchanges the link's one-time
// code for a signed-in session, then continues to the page the link was for.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"));

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const signIn = next === "/fr" || next.startsWith("/fr/") ? "/fr/sign-in" : "/sign-in";
  return NextResponse.redirect(new URL(`${signIn}?link=expired`, origin));
}
