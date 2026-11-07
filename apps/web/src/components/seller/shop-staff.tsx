"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  approveStaff,
  cancelInvitation,
  inviteSchema,
  inviteStaff,
  listInvitations,
  listStaff,
  permissionMessageKey,
  setStaffPermissions,
  setStaffStatus,
  STAFF_PERMISSIONS,
  staffErrorKey,
  type StaffInvitation,
  type StaffMember,
} from "@/modules/staff-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function PermissionBoxes({ available, chosen, onChange }: { available: string[]; chosen: string[]; onChange: (next: string[]) => void }) {
  const t = useTranslations("staff");
  return (
    <fieldset className="grid gap-1.5 sm:grid-cols-2">
      <legend className="mb-1.5 text-sm font-medium">{t("canDo")}</legend>
      {STAFF_PERMISSIONS.filter((key) => available.includes(key)).map((key) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={chosen.includes(key)}
            onChange={(event) => onChange(event.target.checked ? [...chosen, key] : chosen.filter((item) => item !== key))}
            className="size-4"
          />
          {t(`permissionNames.${permissionMessageKey(key)}`)}
        </label>
      ))}
    </fieldset>
  );
}

function usePermissionNames() {
  const t = useTranslations("staff");
  return (keys: string[]) =>
    keys.length === 0
      ? t("viewOnly")
      : STAFF_PERMISSIONS.filter((key) => keys.includes(key)).map((key) => t(`permissionNames.${permissionMessageKey(key)}`)).join(", ");
}

function Member({ member, available, onChanged }: { member: StaffMember; available: string[]; onChanged: () => Promise<void> }) {
  const t = useTranslations("staff");
  const names = usePermissionNames();
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    setWorking(true);
    setFailure(null);
    const { error } = await action();
    await onChanged();
    setWorking(false);
    if (error) {
      setFailure(staffErrorKey(error));
      return false;
    }
    return true;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (chosen && (await run(() => setStaffPermissions(getSupabaseBrowserClient(), member.membership_id, chosen)))) setChosen(null);
  }

  return (
    <li aria-label={member.email} className="grid gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{member.display_name ?? member.email}</p>
          {member.display_name && <p className="break-words text-xs text-muted-foreground">{member.email}</p>}
        </div>
        <StatusPill tone={member.status === "active" ? "good" : "waiting"}>{t(`memberStatus.${member.status}`)}</StatusPill>
      </div>
      <p className="text-sm text-muted-foreground">{names(member.permissions)}</p>
      {member.status === "pending" && <p className="text-sm">{t("approveHint")}</p>}
      {member.status === "active" && !member.role_active && <p className="text-sm">{t("roleBlockedForOwner")}</p>}
      {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
      {chosen ? (
        <form onSubmit={save} noValidate aria-label={t("changePermissions")} className="grid gap-3 rounded-2xl bg-muted/50 p-4">
          <PermissionBoxes available={available} chosen={chosen} onChange={setChosen} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("save")}</button>
            <button type="button" onClick={() => setChosen(null)} className={secondaryButton}>{t("cancel")}</button>
          </div>
        </form>
      ) : removing ? (
        <div className="grid gap-2">
          <p className="text-sm">{t(member.status === "pending" ? "declineWarning" : "removeWarning")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={working} onClick={() => void run(() => setStaffStatus(getSupabaseBrowserClient(), member.membership_id, "removed"))} className={secondaryButton}>{t(member.status === "pending" ? "confirmDecline" : "confirmRemove")}</button>
            <button type="button" onClick={() => setRemoving(false)} className={secondaryButton}>{t("cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {member.status === "pending" && (
            <button type="button" disabled={working} onClick={() => void run(() => approveStaff(getSupabaseBrowserClient(), member.membership_id))} className={primaryButton}>{t("approve")}</button>
          )}
          <button type="button" onClick={() => setChosen(member.permissions)} className={secondaryButton}>{t("changePermissions")}</button>
          {member.status !== "pending" && (
            <button
              type="button"
              disabled={working}
              onClick={() => void run(() => setStaffStatus(getSupabaseBrowserClient(), member.membership_id, member.status === "active" ? "suspended" : "active"))}
              className={secondaryButton}
            >
              {t(member.status === "active" ? "suspend" : "restore")}
            </button>
          )}
          <button type="button" onClick={() => setRemoving(true)} className={secondaryButton}>{t(member.status === "pending" ? "declinePerson" : "remove")}</button>
        </div>
      )}
    </li>
  );
}

/** Staff is between a seller and their people. The database checks every action here. */
export function ShopStaff({ sellerId, available }: { sellerId: string; available: string[] }) {
  const t = useTranslations("staff");
  const format = useFormatter();
  const names = usePermissionNames();
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [staff, pending] = await Promise.all([listStaff(supabase, sellerId), listInvitations(supabase, sellerId)]);
    if (staff.error || pending.error) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setMembers(staff.data as StaffMember[]);
    setInvitations(pending.data as StaffInvitation[]);
  }, [sellerId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const parsed = inviteSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setFailure("emailInvalid");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await inviteStaff(getSupabaseBrowserClient(), sellerId, parsed.data.email, chosen);
    if (error) {
      setWorking(false);
      setFailure(staffErrorKey(error));
      return;
    }
    await load();
    setWorking(false);
    setInviting(false);
    setEmail("");
    setChosen([]);
    setSent(true);
  }

  return (
    <section aria-labelledby="shop-staff" className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shop-staff" className={headingClass}>{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {!inviting && <button type="button" onClick={() => { setInviting(true); setSent(false); setFailure(null); }} className={primaryButton}>{t("invite")}</button>}
      </div>
      <div className="mt-3 grid gap-3">
        {loadFailed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
        {sent && <Notice kind="info">{t("sent")}</Notice>}
        {inviting && (
          <form onSubmit={invite} noValidate aria-label={t("invite")} className="grid gap-3 rounded-2xl bg-muted/50 p-4">
            {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
            <div className="grid gap-1.5">
              <Label htmlFor="staff-email">{t("email")}</Label>
              <Input id="staff-email" type="email" value={email} maxLength={254} autoComplete="off" onChange={(event) => setEmail(event.target.value)} className="h-11 text-base md:text-sm" />
              <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
            </div>
            <PermissionBoxes available={available} chosen={chosen} onChange={setChosen} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("sendInvitation")}</button>
              <button type="button" onClick={() => setInviting(false)} className={secondaryButton}>{t("cancel")}</button>
            </div>
          </form>
        )}
        {members?.length === 0 && invitations.length === 0 && !inviting && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {members && members.length > 0 && (
          <ul>{members.map((member) => <Member key={member.membership_id} member={member} available={available} onChanged={load} />)}</ul>
        )}
        {invitations.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("pending")}</h3>
            <ul className="grid gap-2">
              {invitations.map((invitation) => (
                <li key={invitation.id} aria-label={invitation.email} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {names(invitation.permissions)} · {t("expires", { date: format.dateTime(new Date(invitation.expires_at), { dateStyle: "medium" }) })}
                    </p>
                  </div>
                  <button type="button" onClick={() => void cancelInvitation(getSupabaseBrowserClient(), invitation.id).then(load)} className={secondaryButton}>{t("cancelInvitation")}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
