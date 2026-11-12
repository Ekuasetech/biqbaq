"use client";

import { Check, Download, MoreVertical, Share, Smartphone, SquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { installWay } from "@/modules/pwa";
import { canPromptInstall, listenForInstall, promptInstall, subscribeToInstall, wasInstalled } from "@/modules/pwa/install-events";
import { qrPreview } from "@/modules/referrals/qr";

type Device = "android" | "ios" | "computer";

/**
 * Android's robot, drawn here. It is Google's work, shared under Creative Commons 3.0
 * Attribution; the section credits it, as that licence asks.
 */
function AndroidRobot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden>
      <path d="M8 38a24 24 0 0 1 48 0Z" fill="#3ddc84" />
      <path d="M17 10 12 2M47 10l5-8" stroke="#3ddc84" strokeWidth="3" strokeLinecap="round" />
      <circle cx="22" cy="26" r="3" fill="#0c2352" />
      <circle cx="42" cy="26" r="3" fill="#0c2352" />
    </svg>
  );
}

/** A drawn iPhone outline, used instead of Apple's logo, which Apple does not allow others to use. */
function PhoneOutline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 64" className={className} aria-hidden>
      <rect x="3" y="2" width="34" height="60" rx="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="14" y="7" width="12" height="4" rx="2" fill="currentColor" />
      <rect x="15" y="54" width="10" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

/** The animated phone: Biqbaq's icon drops into a home screen, settles, and is tapped open. */
function PhoneMockup() {
  const tiles = ["#f4b942", "#4f8cff", "#2bb673", "#ff7a59", "#a46bf5", "#20c4d8", "#e85d9b", "#8bc34a", "#ffb4a2", "#6c7a96", "#ffd166"];
  return (
    <div className="app-phone relative mx-auto aspect-[9/16] w-36 rounded-[2rem] border-[5px] border-[#0b1530] bg-[#0b1530] shadow-2xl sm:aspect-[9/18] sm:w-60 sm:rounded-[2.4rem] sm:border-[6px]" aria-hidden>
      <div className="relative h-full overflow-hidden rounded-[1.6rem] bg-gradient-to-b from-[#1b3a7a] to-[#0c2352] p-3 pt-8 sm:rounded-[1.9rem] sm:p-4 sm:pt-9">
        <div className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0b1530]" />
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {tiles.map((colour, index) => (
            <span key={colour} className="app-tile aspect-square rounded-xl" style={{ background: colour, animationDelay: `${index * 60}ms` }} />
          ))}
          {/* Biqbaq's place on the home screen. */}
          <span className="relative aspect-square">
            <span className="app-slot absolute inset-0 rounded-xl border-2 border-dashed border-white/40" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="app-icon absolute inset-0 size-full rounded-xl" />
            <span className="app-tap absolute inset-0 rounded-xl" />
          </span>
        </div>
        <p className="app-label mt-1 text-right text-[0.6rem] font-semibold text-white">Biqbaq</p>
        <div className="absolute inset-x-6 bottom-3 h-1 rounded-full bg-white/50" />
      </div>
    </div>
  );
}

function Step({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="app-step flex items-center gap-3 text-sm" style={{ animationDelay: `${300 + index * 220}ms` }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{index + 1}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * "Get the Biqbaq app" (owner's request, 2026-11-12), after the hero: how to install the
 * installable web app (Q-61) on Android and iPhone, with the phone's own Install button where
 * the browser offers one, and a QR code on a computer to open Biqbaq on a phone.
 */
export function GetTheApp() {
  const t = useTranslations("getTheApp");
  const [device, setDevice] = useState<Device | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [message, setMessage] = useState<"installed" | null>(null);
  const canPrompt = useSyncExternalStore(subscribeToInstall, canPromptInstall, () => false);
  const installed = useSyncExternalStore(subscribeToInstall, wasInstalled, () => false);

  useEffect(() => {
    listenForInstall();
    const timer = setTimeout(() => {
      const ua = navigator.userAgent;
      const ios = installWay({ userAgent: ua, standalone: false, canPrompt: false, maxTouchPoints: navigator.maxTouchPoints }) === "ios" || /iPhone|iPad|iPod/i.test(ua);
      setDevice(ios ? "ios" : /Android/i.test(ua) ? "android" : "computer");
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
      qrPreview(window.location.origin).then(setQr).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Already opened as the app: nothing to offer.
  if (standalone) return null;
  const showAndroid = device !== "ios";
  const showIos = device !== "android";

  return (
    <section aria-labelledby="get-the-app-title" className="pt-14">
      <div className="app-panel relative isolate overflow-hidden rounded-3xl bg-brand-navy px-5 py-10 text-white sm:px-10 sm:py-12">
        <div className="app-glow absolute -top-1/2 -right-1/4 -z-10 size-[42rem] rounded-full" aria-hidden />
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-widest uppercase">
              <Smartphone className="size-3.5" aria-hidden />
              {t("eyebrow")}
            </p>
            <h2 id="get-the-app-title" className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-3 max-w-xl text-white/80">{t("intro")}</p>

            <div className={cn("mt-7 grid gap-4", showAndroid && showIos && "md:grid-cols-2")}>
              {showAndroid && (
                <article aria-label={t("android.name")} className="app-card grid content-start gap-4 rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10">
                  <div className="flex items-center gap-3">
                    <AndroidRobot className="h-8 w-12" />
                    <h3 className="font-semibold">{t("android.name")}</h3>
                  </div>
                  {installed || message === "installed" ? (
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Check className="size-4 text-[#3ddc84]" aria-hidden />
                      {t("installed")}
                    </p>
                  ) : canPrompt ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await promptInstall()) setMessage("installed");
                      }}
                      className="app-install relative inline-flex h-11 w-fit items-center gap-2 overflow-hidden rounded-xl bg-brand-red px-5 text-sm font-bold text-brand-red-foreground hover:bg-brand-red/90"
                    >
                      <Download className="size-4" aria-hidden />
                      {t("install")}
                    </button>
                  ) : (
                    <ol className="grid gap-2.5">
                      <Step index={0}>{t.rich("android.step1", { menu: () => <MoreVertical className="mx-0.5 inline size-4 align-text-bottom" aria-label={t("android.menu")} /> })}</Step>
                      <Step index={1}>{t("android.step2")}</Step>
                      <Step index={2}>{t("android.step3")}</Step>
                    </ol>
                  )}
                </article>
              )}
              {showIos && (
                <article aria-label={t("ios.name")} className="app-card grid content-start gap-4 rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10">
                  <div className="flex items-center gap-3">
                    <PhoneOutline className="h-8 w-5 text-white" />
                    <h3 className="font-semibold">{t("ios.name")}</h3>
                  </div>
                  <ol className="grid gap-2.5">
                    <Step index={0}>{t.rich("ios.step1", { share: () => <Share className="mx-0.5 inline size-4 align-text-bottom" aria-label={t("ios.shareButton")} /> })}</Step>
                    <Step index={1}>{t.rich("ios.step2", { add: () => <SquarePlus className="mx-0.5 inline size-4 align-text-bottom" aria-hidden /> })}</Step>
                    <Step index={2}>{t("ios.step3")}</Step>
                  </ol>
                </article>
              )}
            </div>

            {device === "computer" && qr && (
              <div className="mt-6 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={t("qrAlt")} width={96} height={96} className="size-24 rounded-xl bg-white p-1.5" />
                <p className="max-w-xs text-sm text-white/80">{t("qr")}</p>
              </div>
            )}
            {/* Google's licence for the robot asks for this credit wherever the robot is shown. */}
            {showAndroid && <p className="mt-6 text-[0.65rem] leading-snug text-white/50">{t("credit")}</p>}
          </div>
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
