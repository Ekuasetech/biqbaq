"use client";

import { CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/modules/invoicing";
import { myPaymentAccount, paymentErrorKey, type PaymentAccount } from "@/modules/payment-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/**
 * A shop's online payments (PRD §13.3): off until Biqbaq turns them on, then set up with
 * Stripe, and only "on" once Stripe confirms. The database and Stripe decide; this shows it.
 */
export function OnlinePayments({ sellerId }: { sellerId: string }) {
  const t = useTranslations("payments.setup");
  const tErrors = useTranslations("payments.errors");
  const locale = useLocale();
  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await myPaymentAccount(getSupabaseBrowserClient(), sellerId);
    setAccount(((data ?? []) as PaymentAccount[])[0] ?? null);
  }, [sellerId]);

  // Back from Stripe: ask Stripe how it went, then show it.
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (new URLSearchParams(window.location.search).has("payments")) {
        await fetch("/api/v1/payments/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: sellerId }) }).catch(() => null);
      }
      await load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, sellerId]);

  async function go(path: "onboarding" | "dashboard" | "status") {
    if (working) return;
    setWorking(true);
    setFailure(null);
    const response = await fetch(`/api/v1/payments/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller: sellerId, locale }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response?.ok) {
      setWorking(false);
      setFailure(paymentErrorKey(body?.error));
      return;
    }
    if (body?.url) {
      window.location.assign(body.url);
      return;
    }
    setWorking(false);
    await load();
  }

  if (!account) return null;
  const tone = account.status === "enabled" ? "good" : account.status === "restricted" || account.status === "suspended" ? "bad" : account.status === "disabled" ? "neutral" : "waiting";
  return (
    <section id="online-payments" aria-labelledby="online-payments-title" className={cn(cardClass, "grid scroll-mt-24 gap-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="online-payments-title" className={cn(headingClass, "flex items-center gap-2")}>
          <CreditCard className="size-5" aria-hidden />
          {t("title")}
        </h2>
        <StatusPill tone={tone}>{t(`status.${account.status}`)}</StatusPill>
      </div>
      <p className="text-sm text-muted-foreground">{t(`help.${account.enabled_by_admin ? account.status : "notAllowed"}`)}</p>
      {account.enabled_by_admin && (
        <p className="text-xs text-muted-foreground">{t("fees", { fee: formatMoney(account.application_fee_minor, locale) })}</p>
      )}
      {failure && <Notice kind="error">{tErrors(failure)}</Notice>}
      {account.enabled_by_admin && account.status !== "suspended" && (
        <div className="flex flex-wrap gap-2">
          {account.status !== "enabled" && (
            <button type="button" disabled={working} onClick={() => void go("onboarding")} className={primaryButton}>
              {working ? t("working") : t(account.has_account ? "continue" : "start")}
            </button>
          )}
          {account.has_account && (
            <button type="button" disabled={working} onClick={() => void go("status")} className={secondaryButton}>{t("check")}</button>
          )}
          {account.has_account && account.status !== "onboarding_incomplete" && (
            <button type="button" disabled={working} onClick={() => void go("dashboard")} className={secondaryButton}>{t("dashboard")}</button>
          )}
        </div>
      )}
    </section>
  );
}
