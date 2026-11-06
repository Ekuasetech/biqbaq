"use client";

import type { User } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** The header's sign-in link, or who is signed in and a way to sign out. */
export function AccountMenu() {
  const tNav = useTranslations("nav");
  const t = useTranslations("auth");
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return; // Not configured: the site still works, signed out.
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold transition-colors hover:text-brand-red"
      >
        {tNav("signIn")}
      </Link>
    );
  }

  const name = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : (user.email ?? "");

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm font-semibold lg:block" title={t("accountLabel", { name })}>
        {name}
      </span>
      <button
        type="button"
        onClick={async () => {
          await getSupabaseBrowserClient().auth.signOut();
          router.refresh();
        }}
        className="flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold transition-colors outline-none hover:text-brand-red focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("signOut")}
      </button>
    </div>
  );
}
