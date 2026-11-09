"use client";

import { Mail, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePathname } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getPopupContent,
  POPUP_DELAY_MS,
  POPUP_STORAGE_KEY,
  popupAllowedOn,
  popupErrorKey,
  popupIsDue,
  type PopupContent,
} from "@/modules/email-lists/popup";

function remember(value: { subscribed?: boolean; closedAt?: number }) {
  try {
    window.localStorage.setItem(POPUP_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private windows may refuse; the pop-up may then come back on a later visit.
  }
}

/**
 * Asks visitors to sign up for deals: it fades in 10 seconds after they arrive on a public page. Closing
 * it keeps it away for 30 days; signing up keeps it away for good. Its words come from
 * Super Admin's settings.
 */
export function SubscribePopup() {
  const t = useTranslations("subscribePopup");
  const locale = useLocale() === "fr" ? "fr" : "en";
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [content, setContent] = useState<PopupContent | null>(null);
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const allowed = popupAllowedOn(pathname);
  useEffect(() => {
    if (!allowed) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(POPUP_STORAGE_KEY);
    } catch {
      // Treated as nothing remembered.
    }
    if (!popupIsDue(stored, Date.now())) return;
    const timer = setTimeout(async () => {
      const found = await getPopupContent(getSupabaseBrowserClient()).catch(() => null);
      // Moving to a sign-in page cancels this timer, as `allowed` changes.
      if (found?.enabled) setContent(found);
    }, POPUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [allowed]);

  // Closing by the button, Escape or the backdrop all count as "not now", unless they signed up.
  const signedUp = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    if (!content || !element) return;
    const closed = () => {
      if (!signedUp.current) remember({ closedAt: Date.now() });
    };
    element.addEventListener("close", closed);
    if (!element.open) element.showModal();
    return () => element.removeEventListener("close", closed);
  }, [content]);

  function close() {
    dialog.current?.close();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state === "working") return;
    setState("working");
    setFailure(null);
    const response = await fetch("/api/v1/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, locale, website }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (response?.ok) {
      signedUp.current = true;
      remember({ subscribed: true });
      setState("done");
      return;
    }
    setState("idle");
    setFailure(popupErrorKey(body?.error));
  }

  if (!content) return null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="subscribe-popup-message"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="subscribe-popup m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="relative grid gap-4 p-6 sm:p-8">
        <button type="button" onClick={close} aria-label={t("close")} className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-full hover:bg-muted">
          <X className="size-5" aria-hidden />
        </button>
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-red/10 text-brand-red" aria-hidden>
          <Mail className="size-6" />
        </span>
        <h2 id="subscribe-popup-message" className="pr-8 font-heading text-2xl font-bold tracking-tight text-brand-navy dark:text-foreground">
          {content.message[locale]}
        </h2>
        {state === "done" ? (
          <>
            <p role="status" className="text-sm">{t("thanks")}</p>
            <button type="button" onClick={close} className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">
              {t("done")}
            </button>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="subscribe-popup-email">{t("email")}</Label>
              <Input
                id="subscribe-popup-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 text-base md:text-sm"
              />
            </div>
            {/* Left empty by people; robots fill it in. */}
            <div aria-hidden className="hidden">
              <label htmlFor="subscribe-popup-website">Website</label>
              <input id="subscribe-popup-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </div>
            {failure && <p role="alert" className="text-sm text-destructive">{t(`errors.${failure}`)}</p>}
            <button
              type="submit"
              disabled={state === "working"}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-red px-4 text-sm font-semibold text-brand-red-foreground hover:bg-brand-red/90 disabled:opacity-60"
            >
              {state === "working" ? t("working") : content.button[locale]}
            </button>
            <p className="text-xs text-muted-foreground">{t("consent")}</p>
          </form>
        )}
      </div>
    </dialog>
  );
}
