"use client";

import type { User } from "@supabase/supabase-js";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { ReferralQr } from "@/components/referrals/referral-qr";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  HISTORY_PAGE_SIZE,
  listMyHistory,
  listMyProgrammes,
  referralUrl,
  type ReferralProgramme,
  type ReferralSignup,
} from "@/modules/referrals";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/50 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-extrabold">{value}</dd>
    </div>
  );
}

function History({ codeId }: { codeId: string }) {
  const t = useTranslations("referrals");
  const format = useFormatter();
  const [rows, setRows] = useState<ReferralSignup[] | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await listMyHistory(getSupabaseBrowserClient(), codeId);
      setRows((data ?? []) as ReferralSignup[]);
      setMore(((data ?? []) as ReferralSignup[]).length === HISTORY_PAGE_SIZE);
    }, 0);
    return () => clearTimeout(timer);
  }, [codeId]);

  async function earlier() {
    const oldest = rows?.at(-1);
    if (!oldest) return;
    const { data } = await listMyHistory(getSupabaseBrowserClient(), codeId, oldest.registered_at);
    setRows([...(rows ?? []), ...((data ?? []) as ReferralSignup[])]);
    setMore(((data ?? []) as ReferralSignup[]).length === HISTORY_PAGE_SIZE);
  }

  if (!rows) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("noSignups")}</p>;
  return (
    <div className="grid gap-2">
      {/* Dates only: who signed up stays private to them. */}
      <ol aria-label={t("historyLabel")} className="grid gap-1">
        {rows.map((row, index) => (
          <li key={`${row.registered_at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
            <span>{t("signedUpOn", { date: format.dateTime(new Date(row.registered_at), { dateStyle: "medium" }) })}</span>
            <StatusPill tone={row.completed_at ? "good" : "waiting"}>{t(row.completed_at ? "confirmed" : "waiting")}</StatusPill>
          </li>
        ))}
      </ol>
      {more && <button type="button" onClick={() => void earlier()} className={cn(secondaryButton, "justify-self-center")}>{t("earlier")}</button>}
    </div>
  );
}

function Programme({ programme }: { programme: ReferralProgramme }) {
  const t = useTranslations("referrals");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const url = referralUrl(window.location.origin, programme.code, locale);
  const title = programme.owner_type === "marketer" ? t("marketerTitle") : t("shopTitle", { shop: programme.shop_name ?? "" });

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-label={title} className={cn(cardClass, "grid gap-4")}>
      <div>
        <h2 className={headingClass}>{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(programme.owner_type === "marketer" ? "marketerIntro" : "shopIntro")}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("code")}</dt>
          <dd className="font-mono text-lg font-bold">{programme.code}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{t("link")}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-all font-mono text-sm">{url}</span>
            <button type="button" onClick={() => void copy()} className={secondaryButton}>{t(copied ? "copied" : "copy")}</button>
          </dd>
        </div>
      </dl>
      <div className="grid gap-2">
        <h3 className="font-semibold">{t("qr.title")}</h3>
        <ReferralQr url={url} code={programme.code} />
      </div>
      <dl aria-label={t("statsLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t("total")} value={programme.total} />
        <Stat label={t("today")} value={programme.today} />
        <Stat label={t("thisWeek")} value={programme.this_week} />
        <Stat label={t("thisMonth")} value={programme.this_month} />
      </dl>
      <p className="text-sm text-muted-foreground">{t("waitingCount", { count: programme.waiting })}</p>
      <div className="grid gap-2">
        <h3 className="font-semibold">{t("historyTitle")}</h3>
        <History codeId={programme.code_id} />
      </div>
    </section>
  );
}

/** A marketer's and a shop's referrals, reported separately (§14.4, §14.5). */
export function ReferralDashboard() {
  const t = useTranslations("referrals");
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [programmes, setProgrammes] = useState<ReferralProgramme[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await listMyProgrammes(getSupabaseBrowserClient());
    if (error) {
      setFailed(true);
      return;
    }
    setProgrammes(data as ReferralProgramme[]);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [user, load]);

  if (user === undefined || (user && !programmes && !failed)) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (user === null) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <p className="text-sm text-muted-foreground">{t("signedOut")}</p>
        <Link href="/sign-in?next=/account/referrals" className={cn(primaryButton, "mt-4")}>{t("signIn")}</Link>
      </div>
    );
  }
  if (failed) return <Notice kind="error">{t("errors.loadFailed")}</Notice>;
  if (programmes!.length === 0) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-muted-foreground">{t("none")}</p>
        <Link href="/account" className={cn(primaryButton, "mt-4")}>{t("toAccount")}</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("howItWorks")}</p>
      {programmes!.map((programme) => <Programme key={programme.code_id} programme={programme} />)}
    </div>
  );
}
