import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/safe-path";
import { siteOrigin } from "@/lib/site-origin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseReferral, REFERRAL_COOKIE } from "@/modules/referrals";

// Where confirmation and password reset emails land, and where Google sends people back
// (Q-18). Exchanges the one-time code for a signed-in session, then continues to the page
// it was for.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Not request.nextUrl.origin: behind Render's proxy that is https://localhost:10000.
  const origin = siteOrigin(request);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"));
  const viaGoogle = searchParams.get("via") === "google";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(next, origin));
      if (viaGoogle) {
        // A new Google account claims the referral link this browser opened (BD-11). The
        // database only allows it for an account made minutes ago, once.
        const referral = parseReferral(request.cookies.get(REFERRAL_COOKIE)?.value);
        if (referral) {
          await supabase.rpc("claim_signup_referral", { p_code: referral.code, p_opened_at: referral.openedAt });
          response.cookies.set(REFERRAL_COOKIE, "", { maxAge: 0, path: "/" });
        }
      }
      return response;
    }
  }

  const signIn = next === "/fr" || next.startsWith("/fr/") ? "/fr/sign-in" : "/sign-in";
  // Google sends people back here when they cancel or something fails.
  return NextResponse.redirect(new URL(viaGoogle ? `${signIn}?google=failed` : `${signIn}?link=expired`, origin));
}
