"use client";

import { useClientNow } from "@/lib/use-client-now";
import { getSubscription, setSubscription } from "@/modules/email-lists";
import type { User } from "@supabase/supabase-js";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  EMAIL_CATEGORIES,
  listNotifications,
  listPreferences,
  markNotificationsRead,
  NOTIFICATIONS_CHANGED,
  NOTIFICATIONS_PAGE_SIZE,
  notificationPath,
  setPreference,
  type AppNotification,
  type EmailCategory,
  type NotificationPreference,
} from "@/modules/notifications/in-app";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function useNotificationText() {
  const t = useTranslations("notifications");
  const tRoles = useTranslations("account.roles");
  return (notification: AppNotification) => {
    const role = notification.data.role ?? "";
    const values = {
      role: role && tRoles.has(role) ? tRoles(role) : role,
      shop: notification.data.shop ?? "",
      product: notification.data.product ?? "",
    };
    return t.has(`types.${notification.type}`) ? t(`types.${notification.type}`, values) : t("types.other");
  };
}

/** Joining Biqbaq's own list is the person's choice (Q-46). */
function BiqbaqNews({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("notifications");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await getSubscription(getSupabaseBrowserClient(), null);
      setSubscribed(((data ?? []) as { subscribed: boolean }[])[0]?.subscribed ?? false);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (subscribed === null) return null;
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={subscribed}
        onChange={async (event) => {
          const next = event.target.checked;
          setSubscribed(next);
          const { error } = await setSubscription(getSupabaseBrowserClient(), null, next);
          if (error) setSubscribed(!next);
          else onSaved();
        }}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        <span className="font-semibold">{t("preferences.news.label")}</span>
        <span className="block text-muted-foreground">{t("preferences.news.help")}</span>
      </span>
    </label>
  );
}

function Preferences() {
  const t = useTranslations("notifications");
  const [preferences, setPreferences] = useState<NotificationPreference[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await listPreferences(getSupabaseBrowserClient());
      setPreferences((data ?? []) as NotificationPreference[]);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const show = (category: EmailCategory, enabled: boolean) =>
    setPreferences((current) => (current ?? []).map((p) => (p.category === category ? { ...p, email_enabled: enabled } : p)));

  // Changes at once, and goes back if saving fails.
  async function change(category: EmailCategory, enabled: boolean) {
    setFailed(false);
    setSaved(false);
    show(category, enabled);
    const { error } = await setPreference(getSupabaseBrowserClient(), category, enabled);
    if (error) {
      show(category, !enabled);
      setFailed(true);
      return;
    }
    setSaved(true);
  }

  return (
    <section aria-labelledby="email-preferences" className={cn(cardClass, "grid gap-3")}>
      <h2 id="email-preferences" className={headingClass}>{t("preferences.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("preferences.intro")}</p>
      {preferences && (
        <ul className="grid gap-2">
          {EMAIL_CATEGORIES.map((category) => {
            const enabled = preferences.find((p) => p.category === category)?.email_enabled ?? true;
            return (
              <li key={category}>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => void change(category, event.target.checked)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-semibold">{t(`preferences.${category}.label`)}</span>
                    <span className="block text-muted-foreground">{t(`preferences.${category}.help`)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <BiqbaqNews onSaved={() => setSaved(true)} />
      {saved && <p role="status" className="text-sm text-muted-foreground">{t("preferences.saved")}</p>}
      {failed && <Notice kind="error">{t("errors.generic")}</Notice>}
    </section>
  );
}

/** A person's notifications for the last 90 days (Q-40), and which emails they want. */
export function NotificationCentre() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  // Times like "5 minutes ago" are worked out from this, refreshed each minute.
  const now = useClientNow();
  const router = useRouter();
  const text = useNotificationText();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await listNotifications(getSupabaseBrowserClient());
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems(data as AppNotification[]);
    setMore((data as AppNotification[]).length === NOTIFICATIONS_PAGE_SIZE);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => void load(), 0);
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  async function loadEarlier() {
    const oldest = items?.at(-1);
    if (!oldest) return;
    const { data } = await listNotifications(getSupabaseBrowserClient(), oldest.created_at);
    setItems([...(items ?? []), ...((data ?? []) as AppNotification[])]);
    setMore(((data ?? []) as AppNotification[]).length === NOTIFICATIONS_PAGE_SIZE);
  }

  async function markRead(ids?: string[]) {
    await markNotificationsRead(getSupabaseBrowserClient(), ids);
    const now = new Date().toISOString();
    setItems((current) => (current ?? []).map((item) => (!ids || ids.includes(item.id) ? { ...item, read_at: item.read_at ?? now } : item)));
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  async function open(item: AppNotification) {
    if (!item.read_at) await markRead([item.id]);
    router.push(notificationPath(item.type));
  }

  if (user === undefined) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (user === null) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <p className="text-sm text-muted-foreground">{t("signedOut")}</p>
        <Link href="/sign-in?next=/account/notifications" className={cn(primaryButton, "mt-4")}>{t("signIn")}</Link>
      </div>
    );
  }

  const unread = (items ?? []).filter((item) => !item.read_at).length;
  return (
    <div className="grid gap-4">
      <section aria-labelledby="notification-list" className={cn(cardClass, "grid gap-3")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="notification-list" className={headingClass}>{t("listTitle")}</h2>
          {unread > 0 && (
            <button type="button" onClick={() => void markRead()} className={secondaryButton}>{t("markAllRead")}</button>
          )}
        </div>
        {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
        {items === null && !failed && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
        {items?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {items && items.length > 0 && (
          <ul aria-label={t("listTitle")} className="grid gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void open(item)}
                  className={cn("grid w-full gap-0.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted", !item.read_at && "bg-muted/60")}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("break-words", item.read_at ? "font-medium" : "font-bold")}>
                      {!item.read_at && <span className="sr-only">{t("unreadLabel")} </span>}
                      {text(item)}
                    </span>
                    {!item.read_at && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-red" />}
                  </span>
                  {/* Reasons were typed by people, and are shown as plain text. */}
                  {item.data.reason && <span className="break-words text-muted-foreground">{t("reason", { reason: item.data.reason })}</span>}
                  <time dateTime={item.created_at} className="text-xs text-muted-foreground">
                    {now ? format.relativeTime(new Date(item.created_at), now) : format.dateTime(new Date(item.created_at), { dateStyle: "medium" })}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
        {more && <button type="button" onClick={() => void loadEarlier()} className={cn(secondaryButton, "justify-self-center")}>{t("earlier")}</button>}
        <p className="text-xs text-muted-foreground">{t("keptFor")}</p>
      </section>
      <Preferences />
    </div>
  );
}
