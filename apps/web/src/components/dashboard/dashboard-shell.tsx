"use client";

import { DashboardSearch } from "@/components/dashboard/dashboard-search";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Car,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  FileClock,
  FileText,
  Gavel,
  Images,
  Info,
  Quote,
  LayoutDashboard,
  LogOut,
  Mail,
  MailOpen,
  Megaphone,
  Menu,
  MessageCircle,
  MessagesSquare,
  Package,
  Settings,
  Share2,
  Star,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AccountMenu } from "@/components/layout/account-menu";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { BrandMark } from "@/components/layout/site-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import { UNREAD_CHANGED } from "@/modules/messaging";
import { NOTIFICATIONS_CHANGED } from "@/modules/notifications/in-app";

/** What my_dashboard() returns: the signed-in person's own figures and what they may open. */
export interface DashboardData {
  name: string | null;
  roles: string[];
  access: {
    super_admin: boolean;
    moderation: boolean;
    blog: boolean;
    ads: boolean;
    shop: boolean;
    staff_shops: number;
    referrals: boolean;
  };
  counts: { unread_conversations: number; unread_notifications: number; favourites: number };
  shop?: {
    id: string;
    name: string;
    slug: string;
    products_live: number;
    product_views: number;
    cargo_live: number;
    customer_emails: boolean;
    clients: number;
    invoices_month: number;
    invoiced_month_minor: number;
  };
  admin?: {
    pending_applications: number;
    pending_verifications: number;
    accounts: number;
    new_accounts_today: number;
    active_shops: number;
  };
}

interface DashboardState {
  user: ReturnType<typeof useSessionUser>;
  data: DashboardData | null;
  reload: () => Promise<void>;
}

const DashboardContext = createContext<DashboardState>({ user: undefined, data: null, reload: async () => {} });

/** The dashboard's shared data, for the Overview page and anything else inside the shell. */
export const useDashboard = () => useContext(DashboardContext);

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Shown indented, under the item before it. */
  sub?: boolean;
}

interface NavGroup {
  key: "people" | "content" | "communication" | "records";
  items: NavItem[];
}

/**
 * The sidebar shows only what this person can use. It only decides what is shown: each
 * screen and the database check access again for themselves.
 */
function useNavigation(data: DashboardData | null, pathname: string) {
  const t = useTranslations("dashboard.nav");
  const tShop = useTranslations("shop.sections");
  const main: NavItem[] = [
    { href: "/account", label: t("overview"), icon: LayoutDashboard },
    { href: "/account/messages", label: t("messages"), icon: MessageCircle, badge: data?.counts.unread_conversations },
    { href: "/account/notifications", label: t("notifications"), icon: Bell, badge: data?.counts.unread_notifications },
    { href: "/account/orders", label: t("orders"), icon: ShoppingBag },
  ];
  if (data?.access.shop || (data?.access.staff_shops ?? 0) > 0) main.push({ href: "/account/shop", label: t("shop"), icon: Store });
  // In their own shop, an owner sees its pages beneath it (Q-56). Staff get tabs on the page.
  if (data?.access.shop && (pathname === "/account/shop" || pathname.startsWith("/account/shop/"))) {
    for (const [section, icon] of [
      ["products", Package],
      ["orders", ShoppingBag],
      ["reviews", Star],
      ["cargo-cars", Car],
      ["clients", Mail],
      ["invoices", FileText],
      ["staff", Users],
      ["settings", Settings],
    ] as const) {
      main.push({ href: `/account/shop/${section}`, label: tShop(`${section}.title`), icon, sub: true });
    }
  }
  if (data?.access.referrals) main.push({ href: "/account/referrals", label: t("referrals"), icon: Share2 });

  // Administration, in small groups (owner's choice, 2026-11-08).
  const a = data?.access;
  const people: NavItem[] = [];
  const content: NavItem[] = [];
  const communication: NavItem[] = [];
  const records: NavItem[] = [];
  if (a?.super_admin) {
    people.push(
      { href: "/admin/role-applications", label: t("applications"), icon: ClipboardCheck, badge: data?.admin?.pending_applications },
      { href: "/admin/verification", label: t("verification"), icon: ShieldCheck, badge: data?.admin?.pending_verifications },
      { href: "/admin/people", label: t("people"), icon: Users },
    );
    communication.push(
      { href: "/admin/email-lists", label: t("customerEmails"), icon: Mail },
      { href: "/admin/email-templates", label: t("emailTemplates"), icon: MailOpen },
      { href: "/admin/messages", label: t("conversations"), icon: MessagesSquare },
      { href: "/admin/referrals", label: t("adminReferrals"), icon: Share2 },
    );
    records.push(
      { href: "/admin/payments", label: t("payments"), icon: CreditCard },
      { href: "/admin/audit-log", label: t("auditLog"), icon: FileClock },
    );
  }
  if (a?.moderation) content.push({ href: "/admin/moderation", label: t("moderation"), icon: Gavel });
  if (a?.blog) content.push({ href: "/admin/blog", label: t("blog"), icon: BookOpen });
  if (a?.ads) content.push({ href: "/admin/ads", label: t("ads"), icon: Megaphone });
  // The front page's own photos (owner's request, 2026-11-08): Super Admin only.
  if (a?.super_admin) content.push({ href: "/admin/site-images", label: t("siteImages"), icon: Images });
  if (a?.super_admin) content.push({ href: "/admin/testimonials", label: t("testimonials"), icon: Quote });
  if (a?.super_admin) content.push({ href: "/admin/about", label: t("about"), icon: Info });
  const groups: NavGroup[] = (
    [
      { key: "people", items: people },
      { key: "content", items: content },
      { key: "communication", items: communication },
      { key: "records", items: records },
    ] as NavGroup[]
  ).filter((group) => group.items.length > 0);

  const settings: NavItem | null = a?.super_admin ? { href: "/admin/settings", label: t("settings"), icon: Settings } : null;
  return { main, groups, settings };
}

const isCurrent = (href: string, pathname: string) =>
  // Overview and My shop are only current on their own page; the others also on the pages beneath them.
  href === "/account" || href === "/account/shop" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

const itemClass = (current: boolean) =>
  cn(
    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    current && "bg-primary/10 font-semibold text-primary hover:bg-primary/10 hover:text-primary dark:bg-primary/15",
  );

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate: () => void }) {
  const t = useTranslations("dashboard");
  const newLabel = (count: number) => t("newCount", { count });
  return (
    <ul className="grid gap-0.5">
      {items.map((item) => {
        const current = isCurrent(item.href, pathname);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={false}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={cn(itemClass(current), item.sub && "ml-5 border-l border-border pl-3 rounded-l-none")}
            >
              <Icon className={cn("shrink-0", item.sub ? "size-4" : "size-5")} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <>
                  <span aria-hidden className="rounded-full bg-brand-red px-2 py-0.5 text-xs font-bold text-brand-red-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                  <span className="sr-only">{newLabel(item.badge)}</span>
                </>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const GROUP_STATE = "biqbaq.sidebar.groups";

/**
 * Which admin groups this person opened or closed, remembered in their own browser only.
 * Untouched groups start closed, except the one holding the current page (or the first),
 * so the sidebar fits on a laptop screen (owner's chosen layout, 2026-11-08).
 */
function useGroupState() {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(GROUP_STATE) ?? "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
          setState(Object.fromEntries(Object.entries(saved).filter(([, open]) => typeof open === "boolean")) as Record<string, boolean>);
        }
      } catch {
        // Storage can be unavailable, as in private windows: the defaults apply.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const set = (key: string, open: boolean) =>
    setState((current) => {
      const next = { ...current, [key]: open };
      try {
        window.localStorage.setItem(GROUP_STATE, JSON.stringify(next));
      } catch {
        // Not remembered, but still works.
      }
      return next;
    });
  return { state, set };
}

function GroupSection({
  group,
  pathname,
  saved,
  openByDefault,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  saved: boolean | undefined;
  openByDefault: boolean;
  onToggle: (open: boolean) => void;
  onNavigate: () => void;
}) {
  const t = useTranslations("dashboard");
  // The group holding the current page always stays open.
  const holdsCurrent = group.items.some((item) => isCurrent(item.href, pathname));
  const open = holdsCurrent || (saved ?? openByDefault);
  const waiting = group.items.reduce((sum, item) => sum + (item.badge ?? 0), 0);
  const id = `nav-group-${group.key}`;
  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        disabled={holdsCurrent}
        onClick={() => onToggle(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
      >
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
        <span className="flex-1 text-left">{t(`groups.${group.key}`)}</span>
        {!open && waiting > 0 && (
          <span className="rounded-full bg-brand-red px-1.5 py-0.5 text-[10px] font-bold text-brand-red-foreground normal-case">{waiting > 99 ? "99+" : waiting}</span>
        )}
      </button>
      <div id={id} hidden={!open}>
        <NavLinks items={group.items} pathname={pathname} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function Sidebar({ data, onNavigate }: { data: DashboardData | null; onNavigate: () => void }) {
  const t = useTranslations("dashboard");
  const pathname = usePathname();
  const router = useRouter();
  const { main, groups, settings } = useNavigation(data, pathname);
  const { state, set } = useGroupState();
  const anyCurrent = groups.some((group) => group.items.some((item) => isCurrent(item.href, pathname)));
  return (
    <div className="flex h-full flex-col gap-5 rounded-3xl bg-card p-4 shadow-sm">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-2 font-heading text-xl font-extrabold tracking-tight">
        <BrandMark size={34} />
        Biqbaq
      </Link>
      <nav aria-label={t("navLabel")} className="-mx-1 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-1">
        <NavLinks items={main} pathname={pathname} onNavigate={onNavigate} />
        {groups.length > 0 && (
          <div className="grid gap-3">
            <p className="sr-only">{t("adminHeading")}</p>
            <div aria-hidden className="mx-3 border-t border-border" />
            {groups.map((group, index) => (
              <GroupSection
                key={group.key}
                group={group}
                pathname={pathname}
                saved={state[group.key]}
                openByDefault={!anyCurrent && index === 0}
                onToggle={(open) => set(group.key, open)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </nav>
      {/* Settings and logging out at the bottom, as in the owner's sample. */}
      <div className="grid gap-1 border-t border-border pt-3">
        {settings && <NavLinks items={[settings]} pathname={pathname} onNavigate={onNavigate} />}
        <Link href="/" onClick={onNavigate} className={itemClass(false)}>
          <ArrowLeft className="size-5" aria-hidden />
          {t("backToSite")}
        </Link>
        {data && (
          <button
            type="button"
            onClick={async () => {
              await getSupabaseBrowserClient().auth.signOut();
              onNavigate();
              router.push("/");
              router.refresh();
            }}
            className={cn(itemClass(false), "w-full")}
          >
            <LogOut className="size-5" aria-hidden />
            {t("logOut")}
          </button>
        )}
      </div>
    </div>
  );
}

/** The sidebar and top bar around every account, shop and admin page. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const t = useTranslations("dashboard");
  const user = useSessionUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const reload = useCallback(async () => {
    const { data: result, error } = await getSupabaseBrowserClient().rpc("my_dashboard");
    if (!error) setData(result as DashboardData);
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    // Waits a moment, as Supabase cannot make requests during its own auth callback.
    const timer = setTimeout(() => void reload(), 0);
    // The badges follow reading and new messages.
    const refresh = () => void reload();
    window.addEventListener(UNREAD_CHANGED, refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(UNREAD_CHANGED, refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, reload]);

  // Closes the phone menu when the page changes, or Escape is pressed.
  useEffect(() => {
    const timer = setTimeout(() => setMenuOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const shown = user ? data : null;
  const firstName = (shown?.name ?? "").trim().split(/\s+/)[0];

  return (
    <DashboardContext.Provider value={{ user, data: shown, reload }}>
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-4 p-3 sm:p-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-5rem)] w-64 shrink-0 lg:block">
          <Sidebar data={shown} onNavigate={() => undefined} />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
            <div id="dashboard-menu" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] p-3">
              <Sidebar data={shown} onNavigate={() => setMenuOpen(false)} />
              <button
                type="button"
                aria-label={t("closeMenu")}
                onClick={() => setMenuOpen(false)}
                className="absolute top-6 right-6 flex size-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="sticky top-3 z-40 flex flex-wrap items-center gap-2 rounded-3xl bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur sm:px-5">
            <button
              type="button"
              aria-label={t("openMenu")}
              aria-expanded={menuOpen}
              aria-controls="dashboard-menu"
              onClick={() => setMenuOpen(true)}
              className="flex size-10 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <p className="min-w-0 flex-1 truncate font-heading text-base font-bold sm:text-lg lg:flex-none">
              {firstName ? t("welcome", { name: firstName }) : t("welcomeAnonymous")} <span aria-hidden>👋</span>
            </p>
            {user && <DashboardSearch className="order-last w-full md:order-none md:mx-auto md:w-auto md:max-w-md md:flex-1" />}
            <div className="flex items-center gap-1">
              <AccountMenu />
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </header>
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
