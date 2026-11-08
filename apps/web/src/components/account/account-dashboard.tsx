"use client";

import type { User } from "@supabase/supabase-js";
import { CircleAlert, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FavouritesCard } from "@/components/account/favourites-card";
import { StaffCard } from "@/components/account/staff-card";
import { AdsLink } from "@/components/admin/ads-admin";
import { BlogLink } from "@/components/admin/blog-admin";
import { ModerationLink } from "@/components/admin/moderation";
import { RecentApplications } from "@/components/admin/recent-applications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/supabase/use-session-user";
import { cn } from "@/lib/utils";
import { CATEGORY_SLUGS } from "@/modules/product-catalog/types";
import {
  applicationErrorKey,
  applicationSchemas,
  rolesOpenForApplication,
  submitApplication,
  withdrawApplication,
  type ApplicableRole,
  type RoleApplication,
  type UserRole,
} from "@/modules/role-management";

export const cardClass = "rounded-3xl bg-card p-5 shadow-sm sm:p-7";
export const headingClass = "font-heading text-xl font-extrabold tracking-tight";
export const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors outline-none hover:bg-brand-red hover:text-brand-red-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";

interface AccountData {
  displayName: string;
  accountStatus: string;
  roles: UserRole[];
  applications: RoleApplication[];
}

export function StatusPill({ tone, children }: { tone: "good" | "waiting" | "bad" | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "good" && "bg-emerald-100 text-emerald-900",
        tone === "waiting" && "bg-amber-100 text-amber-950",
        tone === "bad" && "bg-red-100 text-red-900",
        tone === "neutral" && "bg-muted text-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  const Icon = kind === "error" ? CircleAlert : Info;
  return (
    <p role={kind === "error" ? "alert" : "status"} className={cn("flex gap-2 text-sm", kind === "error" && "text-destructive")}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function ProfileCard({ user, data, onSaved }: { user: User; data: AccountData; onSaved: () => void }) {
  const t = useTranslations("account");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error" | "invalid">("idle");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name || name.length > 100) {
      setState("invalid");
      return;
    }
    setState("saving");
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
    if (error) {
      setState("error");
      return;
    }
    // Also updates the name shown in the header.
    await supabase.auth.updateUser({ data: { full_name: name } });
    setState("saved");
    onSaved();
  }

  return (
    <section className={cardClass} aria-labelledby="profile-title">
      <h2 id="profile-title" className={headingClass}>{t("profileTitle")}</h2>
      <form onSubmit={save} noValidate className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="account-name">{t("name")}</Label>
          <Input id="account-name" name="name" defaultValue={data.displayName} maxLength={100} autoComplete="name" className="h-11 text-base md:text-sm" />
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-medium">{t("email")}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <button type="submit" disabled={state === "saving"} className={cn(primaryButton, "w-fit")}>
          {state === "saving" ? t("working") : t("saveName")}
        </button>
        {state === "saved" && <Notice kind="info">{t("nameSaved")}</Notice>}
        {state === "invalid" && <Notice kind="error">{t("errors.nameInvalid")}</Notice>}
        {state === "error" && <Notice kind="error">{t("errors.generic")}</Notice>}
      </form>
    </section>
  );
}

function RolesCard({ roles }: { roles: UserRole[] }) {
  const t = useTranslations("account");
  const tone = { active: "good", suspended: "bad", revoked: "neutral" } as const;
  return (
    <section className={cardClass} aria-labelledby="roles-title">
      <h2 id="roles-title" className={headingClass}>{t("rolesTitle")}</h2>
      <ul className="mt-4 grid gap-3">
        {roles.map((role) => (
          <li key={role.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">{t(`roles.${role.role_key}`)}</span>
            <StatusPill tone={tone[role.status]}>{t(`roleStatus.${role.status}`)}</StatusPill>
            {role.status !== "active" && role.status_reason && (
              <p className="w-full text-xs text-muted-foreground">{t("reason", { reason: role.status_reason })}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApplicationsCard({ applications, onChanged }: { applications: RoleApplication[]; onChanged: () => void }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const tone = { pending: "waiting", approved: "good", rejected: "bad", withdrawn: "neutral" } as const;
  const date = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });

  async function withdraw(id: string) {
    setBusy(id);
    setFailed(null);
    const { error } = await withdrawApplication(getSupabaseBrowserClient(), id);
    if (error) setFailed(applicationErrorKey(error));
    setBusy(null);
    onChanged();
  }

  return (
    <section className={cardClass} aria-labelledby="applications-title">
      <h2 id="applications-title" className={headingClass}>{t("applicationsTitle")}</h2>
      {applications.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("noApplications")}</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {applications.map((application) => (
            <li key={application.id} className="grid gap-1.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{t(`roles.${application.role_key}`)}</span>
                <StatusPill tone={tone[application.status]}>{t(`applicationStatus.${application.status}`)}</StatusPill>
              </div>
              <p className="text-xs text-muted-foreground">{t("submitted", { date: date.format(new Date(application.created_at)) })}</p>
              {application.rejection_reason && (
                <p className="text-xs text-muted-foreground">{t("reason", { reason: application.rejection_reason })}</p>
              )}
              {application.status === "pending" && (
                <button
                  type="button"
                  disabled={busy === application.id}
                  onClick={() => withdraw(application.id)}
                  className="w-fit text-sm font-semibold underline underline-offset-4 disabled:opacity-60"
                >
                  {t("withdraw", { role: t(`roles.${application.role_key}`) })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {failed && <div className="mt-3"><Notice kind="error">{t(`errors.${failed}`)}</Notice></div>}
    </section>
  );
}

function Field({ name, label, error, hint, children }: { name: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  const t = useTranslations("account");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`apply-${name}`}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`apply-${name}-error`} className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
    </div>
  );
}

function ApplicationForm({ role, onDone, onCancel }: { role: ApplicableRole; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("account");
  const tCategories = useTranslations("categories");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(([, value]) => String(value).trim() !== ""),
    );
    const parsed = applicationSchemas[role].safeParse(values);
    setFailed(null);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setWorking(true);
    const { error } = await submitApplication(getSupabaseBrowserClient(), role, parsed.data);
    setWorking(false);
    if (error) setFailed(applicationErrorKey(error));
    else onDone();
  }

  const field = (name: string) => ({
    id: `apply-${name}`,
    name,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `apply-${name}-error` : undefined,
  });
  const inputClass = "h-11 text-base md:text-sm";

  return (
    <form onSubmit={submit} noValidate className="mt-4 grid gap-4 rounded-2xl bg-muted/50 p-4">
      <h3 className="font-semibold">{t("applyingFor", { role: t(`roles.${role}`) })}</h3>
      {role === "seller" && (
        <>
          <Field name="business_name" label={t("fields.businessName")} error={errors.business_name}>
            <Input {...field("business_name")} maxLength={150} className={inputClass} />
          </Field>
          <Field name="contact_information" label={t("fields.contact")} error={errors.contact_information}>
            <Input {...field("contact_information")} maxLength={200} className={inputClass} />
          </Field>
          <Field name="city" label={t("fields.city")} hint={t("fields.cityHint")} error={errors.city}>
            <Input {...field("city")} maxLength={100} autoComplete="address-level2" className={inputClass} />
          </Field>
          <Field name="category" label={t("fields.category")} error={errors.category}>
            <select {...field("category")} defaultValue="" className="h-11 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{t("fields.chooseCategory")}</option>
              {CATEGORY_SLUGS.map((slug) => (
                <option key={slug} value={slug}>{tCategories(slug)}</option>
              ))}
            </select>
          </Field>
          <Field name="description" label={t("fields.description")} error={errors.description}>
            <Textarea {...field("description")} rows={4} maxLength={1000} className="text-base md:text-sm" />
          </Field>
        </>
      )}
      {(role === "marketer" || role === "admin") && (
        <Field name="reason" label={t("fields.reason")} error={errors.reason}>
          <Textarea {...field("reason")} rows={4} maxLength={1000} className="text-base md:text-sm" />
        </Field>
      )}
      {failed && <Notice kind="error">{t(`errors.${failed}`)}</Notice>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={working} className={primaryButton}>
          {working ? t("working") : t("submitApplication")}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-semibold underline underline-offset-4">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function ApplyCard({ roles, onSubmitted }: { roles: ApplicableRole[]; onSubmitted: () => void }) {
  const t = useTranslations("account");
  const [choice, setChoice] = useState<ApplicableRole | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const notice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) notice.current?.scrollIntoView({ block: "center" });
  }, [submitted]);

  return (
    <section className={cardClass} aria-labelledby="apply-title">
      <h2 id="apply-title" className={headingClass}>{t("applyTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("applyIntro")}</p>
      {submitted && (
        <div ref={notice} className="mt-4 rounded-2xl bg-muted p-4 font-medium">
          <Notice kind="info">{t("applicationSent")}</Notice>
        </div>
      )}
      {roles.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("noRolesLeft")}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {roles.map((role) => (
            <li key={role}>
              <button
                type="button"
                aria-pressed={choice === role}
                onClick={() => {
                  setChoice(role);
                  setSubmitted(false);
                }}
                className={cn(
                  "h-full w-full rounded-2xl border p-4 text-left transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring",
                  choice === role ? "border-primary" : "border-border",
                )}
              >
                <span className="block text-sm font-bold">{t("applyFor", { role: t(`roles.${role}`) })}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t(`roleDescriptions.${role}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {choice && roles.includes(choice) && (
        <ApplicationForm
          key={choice}
          role={choice}
          onCancel={() => setChoice(null)}
          onDone={() => {
            setChoice(null);
            setSubmitted(true);
            onSubmitted();
          }}
        />
      )}
    </section>
  );
}

/**
 * Reads directly under the security rules, so it can only ever see this person's
 * own data. Being signed out only changes what this screen shows: nothing here
 * depends on the page to protect the data.
 */
export function AccountDashboard() {
  const t = useTranslations("account");
  const user = useSessionUser();
  const [data, setData] = useState<AccountData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient();
    const [profile, roles, applications] = await Promise.all([
      supabase.from("profiles").select("display_name, status").eq("id", userId).single(),
      // Super Admin may read everyone's, so these must ask for this person's own.
      supabase.from("user_roles").select("id, role_key, status, status_reason").eq("user_id", userId).order("created_at"),
      supabase.from("role_applications").select("id, role_key, status, rejection_reason, created_at").eq("applicant_id", userId).order("created_at", { ascending: false }),
    ]);
    if (profile.error || roles.error || applications.error) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setData({
      displayName: profile.data.display_name ?? "",
      accountStatus: profile.data.status,
      roles: roles.data as UserRole[],
      applications: applications.data as RoleApplication[],
    });
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    // Waits a moment, as Supabase cannot make requests during its own auth callback.
    const timer = setTimeout(() => void load(userId), 0);
    return () => clearTimeout(timer);
  }, [userId, load]);

  if (user === undefined || (user && !data && !loadFailed)) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <h2 className={headingClass}>{t("signedOutTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("signedOutBody")}</p>
        <Link href="/sign-in" className={cn(primaryButton, "mt-5")}>{t("signIn")}</Link>
      </div>
    );
  }

  if (loadFailed || !data) {
    return <Notice kind="error">{t("errors.loadFailed")}</Notice>;
  }

  const reload = () => void load(user.id);
  const isSuperAdmin = data.roles.some((role) => role.role_key === "super_admin" && role.status === "active");

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="grid gap-4">
        <ProfileCard user={user} data={data} onSaved={reload} />
        <RolesCard roles={data.roles} />
        {data.roles.some((role) => role.role_key === "seller" && role.status === "active") && (
          <Link href="/account/shop" className={cn(primaryButton, "w-fit")}>
            {t("shopLink")}
          </Link>
        )}
        <ModerationLink className={cn(primaryButton, "w-fit")}>{t("moderationLink")}</ModerationLink>
        <BlogLink className={cn(primaryButton, "w-fit")}>{t("blogLink")}</BlogLink>
        <AdsLink className={cn(primaryButton, "w-fit")}>{t("adsLink")}</AdsLink>
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/role-applications" className={cn(primaryButton, "w-fit")}>
              {t("adminLink")}
            </Link>
            <Link href="/admin/verification" className={cn(primaryButton, "w-fit")}>
              {t("verificationLink")}
            </Link>
            <Link href="/admin/people" className={cn(primaryButton, "w-fit")}>
              {t("peopleLink")}
            </Link>
            <Link href="/admin/settings" className={cn(primaryButton, "w-fit")}>
              {t("settingsLink")}
            </Link>
            <Link href="/admin/audit-log" className={cn(primaryButton, "w-fit")}>
              {t("auditLogLink")}
            </Link>
          </div>
        )}
      </div>
      <div className="grid gap-4">
        {data.accountStatus === "active" ? (
          <ApplyCard roles={rolesOpenForApplication(data.roles, data.applications)} onSubmitted={reload} />
        ) : (
          <section className={cardClass}>
            <Notice kind="error">{t("accountNotActive")}</Notice>
          </section>
        )}
        <StaffCard />
        <FavouritesCard />
        {isSuperAdmin ? <RecentApplications /> : <ApplicationsCard applications={data.applications} onChanged={reload} />}
      </div>
    </div>
  );
}
