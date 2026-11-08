"use client";

import type { User } from "@supabase/supabase-js";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Notice, primaryButton } from "@/components/account/account-dashboard";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MESSAGE_MAX, messageSchema, messagingErrorKey, startConversation } from "@/modules/messaging";

/**
 * Starts (or continues) a conversation with a shop, about a listing or the shop itself (Q-37).
 * Signed-out visitors are offered sign-in, and the email form stays for them.
 */
export function MessageSeller({ shop, product, vehicle, className }: { shop: string; product?: string; vehicle?: string; className?: string }) {
  const t = useTranslations("messaging");
  const router = useRouter();
  const pathname = usePathname();
  // Unknown until the browser has checked, so the server and first render agree.
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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

  async function send(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const parsed = messageSchema.safeParse(draft);
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { data, error } = await startConversation(getSupabaseBrowserClient(), { shop, product, vehicle }, parsed.data);
    if (error) {
      setWorking(false);
      setFailure(messagingErrorKey(error));
      return;
    }
    router.push(`/account/messages?c=${data as string}`);
  }

  if (!user) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="font-semibold text-foreground underline underline-offset-4">
          {t("signInToMessage")}
        </Link>{" "}
        {t("signInToMessageWhy")}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(primaryButton, "w-fit gap-2", className)}>
        <MessageCircle className="size-4" aria-hidden />
        {t(product || vehicle ? "messageSeller" : "messageShop")}
      </button>
    );
  }

  const field = `message-seller-${product ?? vehicle ?? shop}`;
  return (
    <form onSubmit={send} noValidate aria-label={t("startLabel")} className={cn("grid gap-2", className)}>
      <Label htmlFor={field}>{t("yourMessage")}</Label>
      <Textarea id={field} value={draft} maxLength={MESSAGE_MAX} rows={4} onChange={(event) => setDraft(event.target.value)} />
      <p className="text-xs text-muted-foreground">{t("startHint")}</p>
      {failure && <Notice kind="error">{t.has(`errors.${failure}`) ? t(`errors.${failure}`) : t("errors.generic")}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("sending") : t("send")}</button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
