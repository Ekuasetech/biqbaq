"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptInvitation,
  declineInvitation,
  leaveShop,
  listMyInvitations,
  listMyStaffShops,
  permissionMessageKey,
  STAFF_PERMISSIONS,
  staffErrorKey,
  staffShopState,
  type MyInvitation,
  type MyStaffShop,
} from "@/modules/staff-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/** Only appears for someone who has been invited or already works for a shop. */
export function StaffCard() {
  const t = useTranslations("staff");
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [shops, setShops] = useState<MyStaffShop[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [pending, memberships] = await Promise.all([listMyInvitations(supabase), listMyStaffShops(supabase)]);
    if (pending.error || memberships.error) {
      setFailure("loadFailed");
      return;
    }
    setInvitations(pending.data as MyInvitation[]);
    setShops(memberships.data as MyStaffShop[]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    setWorking(true);
    setFailure(null);
    const { error } = await action();
    if (error) setFailure(staffErrorKey(error));
    await load();
    setWorking(false);
  }

  const names = (keys: string[]) =>
    keys.length === 0
      ? t("viewOnly")
      : STAFF_PERMISSIONS.filter((key) => keys.includes(key)).map((key) => t(`permissionNames.${permissionMessageKey(key)}`)).join(", ");

  if (invitations.length === 0 && shops.length === 0 && !failure) return null;

  return (
    <section aria-labelledby="my-staff" className={cardClass}>
      <h2 id="my-staff" className={headingClass}>{t("myTitle")}</h2>
      <div className="mt-3 grid gap-3">
        {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
        {invitations.map((invitation) => (
          <article key={invitation.id} aria-label={invitation.shop_name} className="grid gap-2 rounded-2xl bg-muted/50 p-4">
            <p className="break-words text-sm font-semibold">{t("invitedBy", { shop: invitation.shop_name })}</p>
            <p className="text-sm text-muted-foreground">{names(invitation.permissions)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={working} onClick={() => void run(() => acceptInvitation(getSupabaseBrowserClient(), invitation.id))} className={primaryButton}>{t("accept")}</button>
              <button type="button" disabled={working} onClick={() => void run(() => declineInvitation(getSupabaseBrowserClient(), invitation.id))} className={secondaryButton}>{t("decline")}</button>
            </div>
          </article>
        ))}
        {shops.map((shop) => {
          const state = staffShopState(shop);
          return (
            <article key={shop.membership_id} aria-label={shop.shop_name} className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words text-sm font-semibold">{shop.shop_name}</p>
                <StatusPill tone={state === "ready" ? "good" : "waiting"}>{t(`shopState.${state}`)}</StatusPill>
              </div>
              <p className="text-sm text-muted-foreground">{names(shop.permissions)}</p>
              {state === "awaitingSeller" && <p className="text-sm">{t("awaitingSeller")}</p>}
              {state === "roleBlocked" && <p className="text-sm">{t("roleBlocked")}</p>}
              <div className="flex flex-wrap gap-2">
                {state === "ready" && <Link href={`/account/shop?seller=${shop.seller_id}`} className={primaryButton}>{t("openShop")}</Link>}
                <button type="button" disabled={working} onClick={() => void run(() => leaveShop(getSupabaseBrowserClient(), shop.membership_id))} className={secondaryButton}>{t("leave")}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
