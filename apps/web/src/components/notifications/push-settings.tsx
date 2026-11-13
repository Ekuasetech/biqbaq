"use client";

import { BellRing, Share, SquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { listPushPreferences, PUSH_CATEGORIES, pushState, setPushPreference, turnPushOff, turnPushOn, type PushCategory, type PushState } from "@/modules/push/client";

const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/**
 * Phone notifications (Q-66): turned on per device, after the person taps the button, and
 * chosen per kind of event. Messages and orders are on by default once turned on.
 */
export function PushSettings() {
  const t = useTranslations("pushSettings");
  const [state, setState] = useState<PushState | null>(null);
  const [choices, setChoices] = useState<Record<PushCategory, boolean> | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setState(await pushState().catch(() => "unsupported" as const));
      const { data } = await listPushPreferences(getSupabaseBrowserClient());
      const rows = (data ?? []) as { category: PushCategory; enabled: boolean }[];
      setChoices(Object.fromEntries(PUSH_CATEGORIES.map((category) => [category, rows.find((row) => row.category === category)?.enabled ?? false])) as Record<PushCategory, boolean>);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function toggle(on: boolean) {
    setWorking(true);
    setFailed(false);
    try {
      setState(on ? await turnPushOn(getSupabaseBrowserClient()) : await turnPushOff(getSupabaseBrowserClient()));
    } catch {
      setFailed(true);
    }
    setWorking(false);
  }

  async function choose(category: PushCategory, enabled: boolean) {
    setFailed(false);
    setChoices((current) => (current ? { ...current, [category]: enabled } : current));
    const { error } = await setPushPreference(getSupabaseBrowserClient(), category, enabled);
    if (error) {
      setChoices((current) => (current ? { ...current, [category]: !enabled } : current));
      setFailed(true);
    }
  }

  return (
    <section aria-labelledby="push-settings" className={cn(cardClass, "grid gap-4")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="push-settings" className={headingClass}>{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {state === "on" && <StatusPill tone="good">{t("onHere")}</StatusPill>}
      </div>

      {state === "off" && (
        <button type="button" disabled={working} onClick={() => void toggle(true)} className={cn(primaryButton, "w-fit gap-2")}>
          <BellRing className="size-4" aria-hidden />
          {working ? t("working") : t("turnOn")}
        </button>
      )}
      {state === "on" && (
        <button type="button" disabled={working} onClick={() => void toggle(false)} className={cn(secondaryButton, "w-fit")}>
          {working ? t("working") : t("turnOff")}
        </button>
      )}
      {state === "ios-install" && (
        <div className="grid gap-2 rounded-xl bg-muted/50 p-4 text-sm">
          <p className="font-semibold">{t("iosTitle")}</p>
          <ol className="grid list-decimal gap-1 pl-5">
            <li>{t.rich("iosStep1", { share: () => <Share className="mx-0.5 inline size-4 align-text-bottom" aria-label={t("shareButton")} /> })}</li>
            <li>{t.rich("iosStep2", { add: () => <SquarePlus className="mx-0.5 inline size-4 align-text-bottom" aria-hidden /> })}</li>
            <li>{t("iosStep3")}</li>
          </ol>
        </div>
      )}
      {state === "blocked" && <Notice kind="info">{t("blocked")}</Notice>}
      {state === "unsupported" && <p className="text-sm text-muted-foreground">{t("unsupported")}</p>}

      {choices && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("which")}</legend>
          {PUSH_CATEGORIES.map((category) => (
            <label key={category} className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={choices[category]} onChange={(event) => void choose(category, event.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-semibold">{t(`categories.${category}.label`)}</span>
                <span className="block text-muted-foreground">{t(`categories.${category}.help`)}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t("whichHint")}</p>
        </fieldset>
      )}
      {failed && <Notice kind="error">{t("failed")}</Notice>}
    </section>
  );
}
