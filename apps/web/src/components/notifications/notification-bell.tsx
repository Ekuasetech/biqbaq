"use client";

import type { User } from "@supabase/supabase-js";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_CHANGED, unreadNotificationCount } from "@/modules/notifications/in-app";

/** The header's bell, with how many notifications are unread. */
export function NotificationBell({ user }: { user: User }) {
  const t = useTranslations("notifications");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const refresh = () =>
      void unreadNotificationCount(supabase).then(({ data }) => setCount(typeof data === "number" ? data : 0));
    refresh();
    // New ones arrive live. The database only sends this person's own.
    const channel = supabase
      .channel(`bell-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user.id]);

  return (
    <Link
      href="/account/notifications"
      prefetch={false}
      aria-label={count > 0 ? t("headerUnread", { count }) : t("title")}
      className="relative flex size-9 items-center justify-center rounded-lg transition-colors hover:text-brand-red"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
