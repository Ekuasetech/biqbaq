"use client";

import { Download, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { INSTALL_HINT_DELAY_MS, INSTALL_HINT_KEY, installHintDue, installWay, type InstallWay } from "@/modules/pwa";
import { canPromptInstall, listenForInstall, promptInstall, subscribeToInstall, wasInstalled } from "@/modules/pwa/install-events";

function remember(value: { installed?: boolean; dismissedAt?: number }) {
  try {
    window.localStorage.setItem(INSTALL_HINT_KEY, JSON.stringify(value));
  } catch {
    // Private windows may refuse; the hint may then come back on a later visit.
  }
}

/**
 * Offers to install Biqbaq on a phone's home screen (Q-61), and switches on the service worker
 * that shows an offline page. Phones only, public pages only, never once installed, and not
 * again for 30 days after "Not now".
 */
export function InstallApp() {
  const t = useTranslations("installApp");
  const [way, setWay] = useState<InstallWay>(null);

  useEffect(() => {
    // The offline page; only on the built site, so development is never served old pages.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    listenForInstall();
    // Installed from here or from the front page's app section: never offered again.
    const unsubscribe = subscribeToInstall(() => {
      if (!wasInstalled()) return;
      remember({ installed: true });
      setWay(null);
    });

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(INSTALL_HINT_KEY);
    } catch {
      // Treated as nothing remembered.
    }
    const phone = window.matchMedia("(max-width: 768px) and (pointer: coarse)").matches;
    const timer = setTimeout(() => {
      if (!phone || !installHintDue(stored, Date.now())) return;
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      setWay(installWay({ userAgent: navigator.userAgent, standalone, canPrompt: canPromptInstall(), maxTouchPoints: navigator.maxTouchPoints }));
    }, INSTALL_HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  async function install() {
    const accepted = await promptInstall();
    remember(accepted ? { installed: true } : { dismissedAt: Date.now() });
    setWay(null);
  }

  function dismiss() {
    remember({ dismissedAt: Date.now() });
    setWay(null);
  }

  if (!way) return null;
  return (
    <aside
      aria-label={t("label")}
      className="fixed inset-x-3 bottom-3 z-40 flex items-start gap-3 rounded-2xl bg-brand-navy p-4 text-white shadow-2xl sm:inset-x-auto sm:right-4 sm:max-w-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("title")}</p>
        {way === "ios" ? (
          <p className="mt-1 text-sm text-white/85">
            {t.rich("ios", { share: () => <Share className="mx-0.5 inline size-4 align-text-bottom" aria-label={t("shareIcon")} /> })}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-white/85">{t("android")}</p>
            <button
              type="button"
              onClick={() => void install()}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-red px-4 text-sm font-bold text-brand-red-foreground hover:bg-brand-red/90"
            >
              <Download className="size-4" aria-hidden />
              {t("install")}
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label={t("notNow")} className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
        <X className="size-5" aria-hidden />
      </button>
    </aside>
  );
}
