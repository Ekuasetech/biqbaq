"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getPopupSettings, POPUP_BUTTON_MAX, POPUP_MESSAGE_MAX, savePopupSettings, type PopupContent } from "@/modules/email-lists/popup";

type Settings = PopupContent & { notifyEmail: string };

const KNOWN = new Set(["DETAILS_INVALID", "EMAIL_INVALID", "REASON_REQUIRED"]);

/**
 * Super Admin edits the sign-up pop-up on public pages: its message and button in English
 * and French, whether it shows, and the address FormSubmit tells about each sign-up.
 */
export function SubscribePopupAdmin() {
  const t = useTranslations("subscribePopupAdmin");
  const [form, setForm] = useState<Settings | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const found = await getPopupSettings(getSupabaseBrowserClient());
    if (found) setForm(found);
    else setMessage({ kind: "error", text: t("errors.load") });
  }, [t]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || working) return;
    if (!reason.trim()) {
      setMessage({ kind: "error", text: t("errors.REASON_REQUIRED") });
      return;
    }
    setWorking(true);
    setMessage(null);
    const { error } = await savePopupSettings(getSupabaseBrowserClient(), form, reason.trim());
    setWorking(false);
    if (error) {
      setMessage({ kind: "error", text: t(`errors.${KNOWN.has(error.message) ? error.message : "GENERIC"}`) });
      return;
    }
    setReason("");
    setMessage({ kind: "info", text: t("saved") });
    await load();
  }

  const field = "h-11 text-base md:text-sm";
  return (
    <section aria-labelledby="subscribe-popup-admin" className={cn(cardClass, "grid gap-4")}>
      <div>
        <h2 id="subscribe-popup-admin" className={headingClass}>{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      {form && (
        <form onSubmit={save} noValidate className="grid gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="size-4" />
            {t("enabled")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["en", "fr"] as const).map((language) => (
              <fieldset key={language} className="grid min-w-0 gap-3 rounded-2xl border border-border p-4">
                <legend className="px-1 text-sm font-semibold">{t(`language.${language}`)}</legend>
                <div className="grid gap-1.5">
                  <Label htmlFor={`popup-message-${language}`}>{t("message")}</Label>
                  <Textarea
                    id={`popup-message-${language}`}
                    rows={3}
                    maxLength={POPUP_MESSAGE_MAX}
                    value={form.message[language]}
                    onChange={(event) => setForm({ ...form, message: { ...form.message, [language]: event.target.value } })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`popup-button-${language}`}>{t("button")}</Label>
                  <Input
                    id={`popup-button-${language}`}
                    maxLength={POPUP_BUTTON_MAX}
                    value={form.button[language]}
                    onChange={(event) => setForm({ ...form, button: { ...form.button, [language]: event.target.value } })}
                    className={field}
                  />
                </div>
              </fieldset>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="popup-notify-email">{t("notifyEmail")}</Label>
            <Input
              id="popup-notify-email"
              type="email"
              inputMode="email"
              maxLength={254}
              value={form.notifyEmail}
              onChange={(event) => setForm({ ...form, notifyEmail: event.target.value })}
              className={field}
            />
            <p className="text-xs text-muted-foreground">{t("notifyHelp")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="popup-reason">{t("reason")}</Label>
            <Input id="popup-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={field} />
          </div>
          <button type="submit" disabled={working} className={cn(primaryButton, "h-11 w-fit")}>{working ? t("saving") : t("save")}</button>
        </form>
      )}
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}
