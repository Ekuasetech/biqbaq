"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { SuperAdminOnly, usePlatformPermissions } from "@/components/admin/role-applications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  assignableRolesFor,
  assignRole,
  listPeople,
  PEOPLE_PAGE_SIZE,
  REASON_MAX_LENGTH,
  ROLE_FILTERS,
  roleActions,
  roleErrorKey,
  savePermissions,
  setRoleStatus,
  type Person,
  type PersonRole,
} from "@/modules/role-management/people";
import { refreshCatalog } from "@/modules/product-catalog/actions";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const dangerButton = "bg-destructive hover:bg-destructive/90";

type Permissions = { key: string; description: string }[];

function PermissionPicker({ permissions, chosen, onChange }: { permissions: Permissions; chosen: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {permissions.map((permission) => (
        <label key={permission.key} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={chosen.includes(permission.key)}
            onChange={(event) => onChange(event.target.checked ? [...chosen, permission.key] : chosen.filter((key) => key !== permission.key))}
            className="mt-0.5 size-4"
          />
          {permission.description}
        </label>
      ))}
    </div>
  );
}

function StatusAction({
  role,
  action,
  onDone,
}: {
  role: PersonRole;
  action: "suspend" | "restore" | "revoke";
  onDone: () => Promise<void>;
}) {
  const t = useTranslations("people");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const id = `${action}-${role.id}`;
  const status = action === "suspend" ? "suspended" : action === "restore" ? "active" : "revoked";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!reason.trim()) {
      setFailure("reasonRequired");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await setRoleStatus(getSupabaseBrowserClient(), role.id, status, reason);
    if (error) {
      setWorking(false);
      setFailure(roleErrorKey(error));
      return;
    }
    // A Seller role change can change the shop. If this refresh fails, public pages catch up within about a minute.
    if (role.role_key === "seller") await refreshCatalog().catch(() => undefined);
    await onDone();
    setWorking(false);
    setOpen(false);
    setReason("");
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>{t(`actions.${action}`)}</button>;
  return (
    <form onSubmit={submit} noValidate aria-label={t(`actions.${action}`)} className="grid w-full gap-2 rounded-2xl bg-muted/50 p-4">
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <p className="text-sm">{t(`hints.${action}`)}</p>
      {role.role_key === "seller" && <p className="text-sm font-medium">{t(`sellerHints.${action}`)}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{t("reason")}</Label>
        <Textarea id={id} value={reason} rows={2} maxLength={REASON_MAX_LENGTH} onChange={(event) => setReason(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={cn(primaryButton, action !== "restore" && dangerButton)}>
          {working ? t("working") : t("confirm", { action: t(`actions.${action}`) })}
        </button>
        <button type="button" onClick={() => { setOpen(false); setFailure(null); }} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function PermissionsAction({ role, permissions, onDone }: { role: PersonRole; permissions: Permissions; onDone: () => Promise<void> }) {
  const t = useTranslations("people");
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working || !chosen) return;
    setWorking(true);
    setFailure(null);
    const { error } = await savePermissions(getSupabaseBrowserClient(), role.id, role.permissions, chosen);
    // Some may have saved before a failure, so show what is true now either way.
    await onDone();
    setWorking(false);
    if (error) setFailure(roleErrorKey(error));
    else setChosen(null);
  }

  if (!chosen) return <button type="button" onClick={() => setChosen(role.permissions)} className={secondaryButton}>{t("actions.permissions")}</button>;
  return (
    <form onSubmit={submit} noValidate aria-label={t("actions.permissions")} className="grid w-full gap-3 rounded-2xl bg-muted/50 p-4">
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <PermissionPicker permissions={permissions} chosen={chosen} onChange={setChosen} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("savePermissions")}</button>
        <button type="button" onClick={() => { setChosen(null); setFailure(null); }} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function AssignRole({ person, permissions, onDone }: { person: Person; permissions: Permissions; onDone: () => Promise<void> }) {
  const t = useTranslations("people");
  const tRoles = useTranslations("account.roles");
  const available = assignableRolesFor(person.roles);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const id = `assign-${person.id}`;
  const takesPermissions = role === "admin" || role === "co_admin";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!role) {
      setFailure("roleRequired");
      return;
    }
    if (!reason.trim()) {
      setFailure("reasonRequired");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await assignRole(getSupabaseBrowserClient(), person.id, role, reason, takesPermissions ? chosen : []);
    if (error) {
      setWorking(false);
      setFailure(roleErrorKey(error));
      return;
    }
    await onDone();
    setWorking(false);
    setOpen(false);
    setRole("");
    setChosen([]);
    setReason("");
  }

  if (available.length === 0) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={cn(secondaryButton, "w-fit")}>{t("actions.assign")}</button>;
  return (
    <form onSubmit={submit} noValidate aria-label={t("actions.assign")} className="grid gap-3 rounded-2xl bg-muted/50 p-4">
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-role`}>{t("role")}</Label>
        <select
          id={`${id}-role`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="h-11 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t("chooseRole")}</option>
          {available.map((key) => <option key={key} value={key}>{tRoles(key)}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{t("sellerHint")}</p>
      </div>
      {role === "super_admin" && <Notice kind="error">{t("superAdminWarning")}</Notice>}
      {takesPermissions && (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">{t("permissions")}</p>
          <p className="text-xs text-muted-foreground">{t("permissionsHint")}</p>
          <PermissionPicker permissions={permissions} chosen={chosen} onChange={setChosen} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-reason`}>{t("reason")}</Label>
        <Textarea id={`${id}-reason`} value={reason} rows={2} maxLength={REASON_MAX_LENGTH} onChange={(event) => setReason(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t("assignReasonHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("giveRole")}</button>
        <button type="button" onClick={() => { setOpen(false); setFailure(null); }} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function RoleRow({ role, permissions, onDone }: { role: PersonRole; permissions: Permissions; onDone: () => Promise<void> }) {
  const t = useTranslations("people");
  const tRoles = useTranslations("account.roles");
  const actions = roleActions(role);
  const description = (key: string) => permissions.find((permission) => permission.key === key)?.description ?? key;
  return (
    <li aria-label={tRoles(role.role_key)} className="grid gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{tRoles(role.role_key)}</span>
        <StatusPill tone={role.status === "active" ? "good" : role.status === "suspended" ? "waiting" : "bad"}>{t(`status.${role.status}`)}</StatusPill>
      </div>
      {role.status !== "active" && role.status_reason && <p className="break-words text-sm text-muted-foreground">{t("statusReason", { reason: role.status_reason })}</p>}
      {actions.includes("permissions") && role.status !== "revoked" && (
        <p className="text-sm text-muted-foreground">
          {role.permissions.length === 0 ? t("noPermissions") : role.permissions.map(description).join(", ")}
        </p>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) =>
            action === "permissions" ? (
              <PermissionsAction key={action} role={role} permissions={permissions} onDone={onDone} />
            ) : (
              <StatusAction key={action} role={role} action={action} onDone={onDone} />
            ),
          )}
        </div>
      )}
    </li>
  );
}

function PeopleRoles() {
  const t = useTranslations("people");
  const tRoles = useTranslations("account.roles");
  const permissions = usePlatformPermissions();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listPeople(getSupabaseBrowserClient(), search, role, page);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as Person[]);
  }, [search, role, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(typed.trim());
        }}
        className={cn(cardClass, "grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end")}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="people-search">{t("search")}</Label>
          <Input id="people-search" value={typed} maxLength={200} onChange={(event) => setTyped(event.target.value)} className="h-11 text-base md:text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="people-role">{t("filterRole")}</Label>
          <select
            id="people-role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            className="h-11 min-w-0 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ROLE_FILTERS.map((key) => <option key={key} value={key}>{key === "all" ? t("allPeople") : tRoles(key)}</option>)}
          </select>
        </div>
        <button type="submit" className={primaryButton}>{t("searchButton")}</button>
      </form>

      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      {!rows && !failed && <Skeleton className="h-64 rounded-3xl" />}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((person) => (
            <li key={person.id}>
              <article aria-label={person.email} className={cn(cardClass, "grid gap-3")}>
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{person.display_name ?? person.email}</h2>
                  {person.display_name && <p className="break-words text-sm text-muted-foreground">{person.email}</p>}
                </div>
                <ul>{person.roles.map((item) => <RoleRow key={item.id} role={item} permissions={permissions} onDone={load} />)}</ul>
                <AssignRole person={person} permissions={permissions} onDone={load} />
              </article>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm">{t("page", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </nav>
      )}
    </div>
  );
}

export function PeopleRolesScreen() {
  return (
    <SuperAdminOnly>
      <PeopleRoles />
    </SuperAdminOnly>
  );
}
