"use client";

import type { User } from "@supabase/supabase-js";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UNREAD_CHANGED, unreadCount } from "@/modules/messaging";

/** The header's way into the inbox, with how many conversations have something unread. */
function MessagesLink({ user }: { user: User }) {
  const t = useTranslations("messaging");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const refresh = () =>
      void unreadCount(supabase).then(({ data }) => setCount(typeof data === "number" ? data : 0));
    refresh();
    // New messages arrive live; the inbox says when it has read some.
    const channel = supabase
      .channel(`unread-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .subscribe();
    window.addEventListener(UNREAD_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener(UNREAD_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user.id]);

  return (
    <Link
      href="/account/messages"
      prefetch={false}
      aria-label={count > 0 ? t("headerUnread", { count }) : t("title")}
      className="relative flex size-9 items-center justify-center rounded-lg transition-colors hover:text-brand-red"
    >
      <MessageCircle className="size-5" aria-hidden />
      {count > 0 && (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

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
      <MessagesLink user={user} />
      <Link
        href="/account"
        aria-label={t("accountLink")}
        title={t("accountLabel", { name })}
        className="flex h-9 items-center gap-2 rounded-lg px-1 text-sm font-semibold transition-colors hover:text-brand-red"
      >
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-40 truncate lg:block">{name}</span>
      </Link>
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
