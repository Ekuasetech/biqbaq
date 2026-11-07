"use client";

import { CircleAlert, Info, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import { APPLICABLE_ROLES } from "@/modules/role-management";
import {
  ADMIN_PAGE_SIZE,
  adminErrorKey,
  APPLICATION_STATUSES,
  approveApplication,
  listAdminApplications,
  rejectApplication,
  type AdminApplication,
} from "@/modules/role-management/admin";

const cardClass = "rounded-3xl bg-card p-5 shadow-sm sm:p-6";
const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors outline-none hover:bg-brand-red hover:text-brand-red-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";
const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-bold transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";

const STATUS_TONE = {
  pending: "bg-amber-100 text-amber-950",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
  withdrawn: "bg-muted text-foreground",
} as const;

// Application details are stored by key, so these give each one its label.
const DETAIL_LABELS: Record<string, string> = {
  business_name: "fields.businessName",
  contact_information: "fields.contact",
  city: "fields.city",
  category: "fields.category",
  description: "fields.description",
  seller_name: "fields.sellerName",
  invitation_reference: "fields.invitation",
  reason: "fields.reason",
};

// The database stores details alphabetically, so this restores the form's order.
const DETAIL_ORDER = [
  "business_name", "seller_name", "contact_information", "city", "country", "category",
  "description", "invitation_reference", "reason",
];
const detailOrder = (key: string) => {
  const index = DETAIL_ORDER.indexOf(key);
  return index === -1 ? DETAIL_ORDER.length : index;
};

function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  const Icon = kind === "error" ? CircleAlert : Info;
  return (
    <p role={kind === "error" ? "alert" : "status"} className={cn("flex gap-2 text-sm", kind === "error" && "text-destructive")}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function useDateFormat() {
  const locale = useLocale();
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
}

function StatusPill({ status }: { status: AdminApplication["status"] }) {
  const t = useTranslations("account");
  return (
    <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>
      {t(`applicationStatus.${status}`)}
    </span>
  );
}

function Details({ details }: { details: Record<string, unknown> }) {
  const tAccount = useTranslations("account");
  const tCategories = useTranslations("categories");
  const t = useTranslations("admin");
  return (
    <dl className="grid gap-2 text-sm">
      {Object.entries(details).sort(([a], [b]) => detailOrder(a) - detailOrder(b)).map(([key, value]) => {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        const label = DETAIL_LABELS[key];
        return (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">
              {label ? tAccount(label) : key === "country" ? t("country") : key}
            </dt>
            <dd className="break-words whitespace-pre-wrap">
              {key === "category" && tCategories.has(text as never) ? tCategories(text as never) : text}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Other applications from the same person, so a reviewer can see what came before. */
function History({ application }: { application: AdminApplication }) {
  const t = useTranslations("admin");
  const tAccount = useTranslations("account");
  const date = useDateFormat();
  const [others, setOthers] = useState<AdminApplication[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    listAdminApplications(getSupabaseBrowserClient(), { applicant: application.applicant_id }).then(({ data, error }) => {
      if (!current) return;
      if (error) setFailed(true);
      else setOthers((data as AdminApplication[]).filter((other) => other.id !== application.id));
    });
    return () => {
      current = false;
    };
  }, [application.applicant_id, application.id]);

  if (failed) return <Notice kind="error">{t("errors.generic")}</Notice>;
  if (!others) return <Skeleton className="h-10 rounded-xl" />;
  if (others.length === 0) return <p className="text-sm text-muted-foreground">{t("noHistory")}</p>;

  return (
    <ul className="grid gap-2">
      {others.map((other) => (
        <li key={other.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">{tAccount(`roles.${other.role_key}`)}</span>
          <StatusPill status={other.status} />
          <span className="text-xs text-muted-foreground">{date.format(new Date(other.created_at))}</span>
          {other.rejection_reason && (
            <span className="w-full text-xs text-muted-foreground">
              {tAccount("reason", { reason: other.rejection_reason })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DecisionPanel({
  application,
  permissions,
  onDecided,
}: {
  application: AdminApplication;
  permissions: { key: string; description: string }[];
  onDecided: (message: "approved" | "rejected") => void;
}) {
  const t = useTranslations("admin");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const isAdmin = application.role_key === "admin";

  async function approve() {
    setWorking(true);
    setFailed(null);
    const { error } = await approveApplication(getSupabaseBrowserClient(), application.id, isAdmin ? chosen : []);
    setWorking(false);
    if (error) setFailed(adminErrorKey(error));
    else onDecided("approved");
  }

  async function reject(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setFailed("reasonRequired");
      return;
    }
    setWorking(true);
    setFailed(null);
    const { error } = await rejectApplication(getSupabaseBrowserClient(), application.id, reason);
    setWorking(false);
    if (error) setFailed(adminErrorKey(error));
    else onDecided("rejected");
  }

  return (
    <div className="grid gap-4 rounded-2xl bg-muted/50 p-4">
      {application.role_key === "seller_staff" && <Notice kind="info">{t("staffNote")}</Notice>}
      {isAdmin && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{t("permissionsTitle")}</legend>
          <p className="text-xs text-muted-foreground">{t("permissionsHint")}</p>
          {permissions.map((permission) => (
            <label key={permission.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={chosen.includes(permission.key)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key),
                  )
                }
              />
              {permission.description}
            </label>
          ))}
        </fieldset>
      )}
      {rejecting ? (
        <form onSubmit={reject} noValidate className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`reason-${application.id}`}>{t("reasonLabel")}</Label>
            <Textarea
              id={`reason-${application.id}`}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="text-base md:text-sm"
            />
            <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={working} className={primaryButton}>{t("confirmReject")}</button>
            <button type="button" onClick={() => setRejecting(false)} className={secondaryButton}>{t("cancel")}</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={working} onClick={approve} className={primaryButton}>
            {working ? t("working") : t("approve")}
          </button>
          <button type="button" disabled={working} onClick={() => setRejecting(true)} className={secondaryButton}>
            {t("reject")}
          </button>
        </div>
      )}
      {failed && <Notice kind="error">{t(`errors.${failed}`)}</Notice>}
    </div>
  );
}

/** What an Admin can be given, for the choices shown when approving one. */
export function usePlatformPermissions() {
  const [permissions, setPermissions] = useState<{ key: string; description: string }[]>([]);
  useEffect(() => {
    getSupabaseBrowserClient()
      .from("permissions")
      .select("key, description")
      .eq("scope", "platform")
      .order("key")
      .then(({ data }) => setPermissions(data ?? []));
  }, []);
  return permissions;
}

export function ApplicationCard({
  application,
  permissions,
  onDecided,
}: {
  application: AdminApplication;
  permissions: { key: string; description: string }[];
  onDecided: (message: "approved" | "rejected") => void;
}) {
  const t = useTranslations("admin");
  const tAccount = useTranslations("account");
  const date = useDateFormat();
  const [open, setOpen] = useState(false);
  const name = application.applicant_name ?? application.applicant_email;

  return (
    <li>
      <article className={cardClass} aria-label={t("applicationFrom", { name })}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold break-words">{name}</h2>
            <p className="text-sm break-words text-muted-foreground">{application.applicant_email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{tAccount(`roles.${application.role_key}`)}</span>
            <StatusPill status={application.status} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tAccount("submitted", { date: date.format(new Date(application.created_at)) })}
          {application.decided_at && application.reviewer_name && (
            <> · {t("decidedBy", { name: application.reviewer_name, date: date.format(new Date(application.decided_at)) })}</>
          )}
        </p>
        {application.rejection_reason && (
          <p className="mt-1 text-sm">{tAccount("reason", { reason: application.rejection_reason })}</p>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mt-3 text-sm font-semibold underline underline-offset-4"
        >
          {open ? t("hideDetails") : t("viewDetails")}
        </button>
        {open && (
          <div className="mt-4 grid gap-5">
            <section>
              <h3 className="mb-2 text-sm font-bold">{t("detailsTitle")}</h3>
              <Details details={application.details} />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-bold">{t("historyTitle")}</h3>
              <History application={application} />
            </section>
          </div>
        )}
        {application.status === "pending" && (
          <div className="mt-4">
            <DecisionPanel application={application} permissions={permissions} onDecided={onDecided} />
          </div>
        )}
      </article>
    </li>
  );
}

function ApplicationsList() {
  const t = useTranslations("admin");
  const tAccount = useTranslations("account");
  const [status, setStatus] = useState<string>("pending");
  const [role, setRole] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminApplication[] | null>(null);
  const permissions = usePlatformPermissions();
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await listAdminApplications(getSupabaseBrowserClient(), {
      status: status === "all" ? undefined : status,
      role: role || undefined,
      search: search || undefined,
      page,
    });
    if (error) {
      setFailed(adminErrorKey(error));
      return;
    }
    setFailed(null);
    setRows(data as AdminApplication[]);
  }, [status, role, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);


  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 rounded-3xl bg-card p-4 shadow-sm sm:p-5">
        <div role="group" aria-label={t("statusFilter")} className="flex flex-wrap gap-2">
          {[...APPLICATION_STATUSES, "all"].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
                setNotice(null);
              }}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                status === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
              )}
            >
              {t(`statusTabs.${value}`)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(typed.trim());
            setPage(1);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="grid min-w-52 flex-1 gap-1">
            <Label htmlFor="application-search" className="text-xs">{t("searchLabel")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="application-search"
                type="search"
                maxLength={100}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-10 pl-9 text-base md:text-sm"
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="application-role" className="text-xs">{t("roleFilter")}</Label>
            <select
              id="application-role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("allRoles")}</option>
              {APPLICABLE_ROLES.map((key) => (
                <option key={key} value={key}>{tAccount(`roles.${key}`)}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={cn(secondaryButton, "h-10")}>{t("searchButton")}</button>
        </form>
      </div>

      {notice && <Notice kind="info">{t(`decision.${notice}`)}</Notice>}
      {failed && <Notice kind="error">{t(`errors.${failed}`)}</Notice>}

      {!rows && !failed && <Skeleton className="h-40 rounded-3xl" />}
      {rows && rows.length === 0 && (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {rows && rows.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">{t("count", { count: total })}</p>
          <ul className="grid gap-4">
            {rows.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                permissions={permissions}
                onDecided={(message) => {
                  setNotice(message);
                  void load();
                }}
              />
            ))}
          </ul>
        </>
      )}
      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm text-muted-foreground">{t("pageOf", { page, total: pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </nav>
      )}
    </div>
  );
}

/**
 * Checking the role here only decides what this screen shows. The protection is in
 * the database, which refuses to list or decide anything for anyone else.
 */
export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const user = useSessionUser();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(async () => {
      const { data } = await getSupabaseBrowserClient()
        .from("user_roles")
        .select("role_key")
        .eq("user_id", userId)
        .eq("role_key", "super_admin")
        .eq("status", "active");
      setAllowed((data ?? []).length > 0);
    }, 0);
    return () => clearTimeout(timer);
  }, [userId]);

  if (user === undefined || (user && allowed === null)) return <Skeleton className="h-64 rounded-3xl" />;

  if (!user || !allowed) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className="font-heading text-xl font-extrabold">{t("noAccessTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{user ? t("noAccessBody") : t("signInBody")}</p>
        <Link href={user ? "/account" : "/sign-in"} className={cn(primaryButton, "mt-5")}>
          {user ? t("backToAccount") : t("signIn")}
        </Link>
      </div>
    );
  }

  return children;
}

export function RoleApplicationsScreen() {
  return (
    <SuperAdminOnly>
      <ApplicationsList />
    </SuperAdminOnly>
  );
}
