"use client";

import type { User } from "@supabase/supabase-js";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { primaryButton } from "@/components/account/account-dashboard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getSubscription, setSubscription } from "@/modules/email-lists";

/**
 * "Get updates" on a shop page, for signed-in people, only when Super Admin has turned on
 * customer emails for the shop (Q-43). Pressing it is the person's own consent (Q-42).
 */
export function GetUpdates({ shop, className }: { shop: string; className?: string }) {
  const t = useTranslations("emailLists.getUpdates");
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<{ available: boolean; subscribed: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      const { data } = await getSubscription(getSupabaseBrowserClient(), shop);
      setState(((data ?? []) as { available: boolean; subscribed: boolean }[])[0] ?? null);
    }, 0);
    return () => clearTimeout(timer);
  }, [user, shop]);

  if (!user || !state?.available) return null;

  async function toggle() {
    setFailed(false);
    const next = !state!.subscribed;
    const { error } = await setSubscription(getSupabaseBrowserClient(), shop, next);
    if (error) {
      setFailed(true);
      return;
    }
    setState({ available: true, subscribed: next });
  }

  return (
    <div className={cn("grid gap-1", className)}>
      <button type="button" aria-pressed={state.subscribed} onClick={() => void toggle()} className={cn(primaryButton, "w-fit gap-2")}>
        <BellRing className="size-4" aria-hidden />
        {t(state.subscribed ? "stop" : "start")}
      </button>
      <p className="text-xs text-muted-foreground">{t(state.subscribed ? "subscribedHint" : "hint")}</p>
      {failed && <p className="text-xs text-destructive">{t("failed")}</p>}
    </div>
  );
}
