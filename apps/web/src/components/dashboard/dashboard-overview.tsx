"use client";

import {
  Bell,
  ClipboardCheck,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Package,
  Receipt,
  ShieldCheck,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-shell";
import { useNotificationText } from "@/components/notifications/notification-centre";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useClientNow } from "@/lib/use-client-now";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/modules/invoicing";
import { listConversations, type Conversation } from "@/modules/messaging";
import { listNotifications, notificationPath, type AppNotification } from "@/modules/notifications/in-app";

// The website's own colours (owner's choice, 2026-11-08): navy and red, solid and tinted.
const TONES = [
  { card: "bg-brand-navy text-white", icon: "bg-white/15 text-white", label: "text-white/80" },
  { card: "bg-brand-red text-brand-red-foreground", icon: "bg-white/20 text-white", label: "text-white/85" },
  { card: "bg-[oklch(0.92_0.03_262)] text-foreground dark:bg-primary/15", icon: "bg-white/70 text-primary dark:bg-primary/20", label: "text-muted-foreground" },
  { card: "bg-[oklch(0.93_0.035_27)] text-foreground dark:bg-brand-red/20", icon: "bg-white/70 text-brand-red dark:bg-brand-red/25", label: "text-muted-foreground" },
];

interface Card {
  key: string;
  value: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

function StatCard({ card, tone }: { card: Card; tone: (typeof TONES)[number] }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      prefetch={false}
      className={cn("flex h-full flex-col items-start gap-3 rounded-2xl p-4 shadow-sm transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-4 sm:p-5", tone.card)}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full sm:size-12", tone.icon)}>
        <Icon className="size-5 sm:size-6" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-2xl font-extrabold tabular-nums sm:text-3xl">{card.value}</span>
        <span className={cn("block text-sm leading-snug font-medium sm:truncate", tone.label)}>{card.label}</span>
      </span>
    </Link>
  );
}

/** A short table, which becomes stacked rows on a phone. */
function RecentTable({
  title,
  columns,
  rows,
  empty,
  more,
}: {
  title: string;
  columns: [string, string];
  rows: { key: string; time: string; main: React.ReactNode; href: string }[] | null;
  empty: string;
  more: { href: string; label: string };
}) {
  const t = useTranslations("dashboard.overview");
  return (
    <section aria-label={title} className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        <Link href={more.href} prefetch={false} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {more.label}
        </Link>
      </div>
      <div className="rounded-2xl bg-card p-2 shadow-sm sm:p-3">
        {rows === null ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <table className="block w-full text-sm md:table">
            <thead className="hidden md:table-header-group">
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 pb-2 font-semibold"># {columns[0]}</th>
                <th scope="col" className="px-3 pb-2 font-semibold"># {columns[1]}</th>
                <th scope="col" className="px-3 pb-2 text-right font-semibold"># {t("action")}</th>
              </tr>
            </thead>
            <tbody className="grid gap-1 md:table-row-group">
              {rows.map((row) => (
                <tr key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 hover:bg-muted/60 md:table-row">
                  <td className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground md:table-cell md:px-3 md:py-2.5">
                    <Clock className="inline size-4 shrink-0" aria-hidden /> <span className="align-middle">{row.time}</span>
                  </td>
                  <td className="min-w-0 md:max-w-0 md:px-3 md:py-2.5 md:w-full">
                    <span className="block truncate">{row.main}</span>
                  </td>
                  <td className="text-right md:px-3 md:py-2.5">
                    <Link
                      href={row.href}
                      prefetch={false}
                      className="inline-flex h-8 items-center rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15"
                    >
                      {t("see")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** The Overview at the top of the account page: today, the figures, and what's new. */
export function DashboardOverview() {
  const t = useTranslations("dashboard.overview");
  const tMessaging = useTranslations("messaging");
  const locale = useLocale();
  const format = useFormatter();
  const now = useClientNow();
  const notificationText = useNotificationText();
  const { user, data } = useDashboard();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      const [messages, alerts] = await Promise.all([listConversations(supabase, false), listNotifications(supabase)]);
      setConversations(((messages.data ?? []) as Conversation[]).slice(0, 6));
      setNotifications(((alerts.data ?? []) as AppNotification[]).slice(0, 6));
    }, 0);
    return () => clearTimeout(timer);
  }, [userId]);

  if (!user) return null;
  const number = (value: number) => format.number(value);
  const cards: Card[] = [];
  if (data) {
    cards.push(
      { key: "messages", value: number(data.counts.unread_conversations), label: t("cards.unreadMessages"), href: "/account/messages", icon: MessageCircle },
      { key: "notifications", value: number(data.counts.unread_notifications), label: t("cards.unreadNotifications"), href: "/account/notifications", icon: Bell },
    );
    if (data.shop) {
      cards.push(
        { key: "products", value: number(data.shop.products_live), label: t("cards.liveProducts"), href: "/account/shop", icon: Package },
        { key: "views", value: number(data.shop.product_views), label: t("cards.productViews"), href: "/account/shop", icon: Eye },
      );
      if (data.shop.customer_emails) {
        cards.push(
          { key: "clients", value: number(data.shop.clients), label: t("cards.clients"), href: "/account/shop#customer-emails", icon: Users },
          { key: "invoiced", value: formatMoney(data.shop.invoiced_month_minor, locale), label: t("cards.invoicedMonth"), href: "/account/shop#customer-emails", icon: Receipt },
        );
      }
    }
    if (data.admin) {
      cards.push(
        { key: "applications", value: number(data.admin.pending_applications), label: t("cards.applications"), href: "/admin/role-applications", icon: ClipboardCheck },
        { key: "verifications", value: number(data.admin.pending_verifications), label: t("cards.verifications"), href: "/admin/verification", icon: ShieldCheck },
        { key: "accounts", value: number(data.admin.accounts), label: t("cards.accounts"), href: "/admin/people", icon: Users },
        { key: "shops", value: number(data.admin.active_shops), label: t("cards.shops"), href: "/admin/moderation", icon: Store },
      );
    }
    cards.push({ key: "favourites", value: number(data.counts.favourites), label: t("cards.favourites"), href: "/account#favourites", icon: Heart });
  }

  const time = (iso: string) =>
    now && now.getTime() - new Date(iso).getTime() < 86400000
      ? format.dateTime(new Date(iso), { timeStyle: "short" })
      : format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="grid gap-6">
      <p className="font-heading text-2xl font-bold">
        {t("today")} <span className="text-muted-foreground">|</span> {now ? format.dateTime(now, { month: "long", day: "numeric" }) : ""}
      </p>
      <section aria-label={t("figures")} className="min-h-52 sm:min-h-56">
        {data ? (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {cards.map((card, index) => (
              <li key={card.key}>
                <StatCard card={card} tone={TONES[index % TONES.length]} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <Skeleton key={n} className="h-24 rounded-2xl" />)}
          </div>
        )}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <RecentTable
          title={t("recentMessages")}
          columns={[t("time"), t("conversation")]}
          empty={t("noMessages")}
          more={{ href: "/account/messages", label: t("seeAll") }}
          rows={
            conversations?.map((conversation) => ({
              key: conversation.id,
              time: time(conversation.last_message_at),
              href: `/account/messages?c=${conversation.id}`,
              main: (
                <>
                  <span className={cn(conversation.unread > 0 && "font-bold")}>
                    {conversation.side === "buyer" ? conversation.shop_name : conversation.other_name || tMessaging("aCustomer")}
                  </span>
                  <span className="text-muted-foreground"> · {conversation.last_body}</span>
                </>
              ),
            })) ?? null
          }
        />
        <RecentTable
          title={t("recentNotifications")}
          columns={[t("time"), t("notification")]}
          empty={t("noNotifications")}
          more={{ href: "/account/notifications", label: t("seeAll") }}
          rows={
            notifications?.map((item) => ({
              key: item.id,
              time: time(item.created_at),
              href: notificationPath(item.type),
              main: <span className={cn(!item.read_at && "font-bold")}>{notificationText(item)}</span>,
            })) ?? null
          }
        />
      </div>
    </div>
  );
}
