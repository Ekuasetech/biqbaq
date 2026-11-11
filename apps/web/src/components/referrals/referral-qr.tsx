"use client";

import { Download, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { qrCard, qrFileName, qrPreview } from "@/modules/referrals/qr";

const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/**
 * The referral link as a QR code, to download and print or to share from a phone
 * (owner's request, 2026-11-11). Scanning it opens the same link as copying it.
 */
export function ReferralQr({ url, code }: { url: string; code: string }) {
  const t = useTranslations("referrals.qr");
  const [preview, setPreview] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    qrPreview(url).then((image) => live && setPreview(image)).catch(() => live && setFailed(true));
    // Only phones and browsers that can share an image get the Share button.
    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    const timer = setTimeout(() => setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] })), 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [url]);

  async function file() {
    const blob = await qrCard(url, code, t("caption"));
    return new File([blob], qrFileName(code), { type: "image/png" });
  }

  async function download() {
    setWorking(true);
    setFailed(false);
    try {
      const image = await file();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(image);
      link.download = image.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      setFailed(true);
    }
    setWorking(false);
  }

  async function share() {
    setWorking(true);
    setFailed(false);
    try {
      await navigator.share({ files: [await file()], title: t("shareTitle"), text: t("shareText", { url }) });
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
    }
    setWorking(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={t("alt", { code })} width={160} height={160} className="size-40 rounded-xl border border-border bg-white" />
      ) : (
        <div className="size-40 rounded-xl bg-muted" aria-hidden />
      )}
      <div className="grid gap-2">
        <p className="max-w-xs text-sm text-muted-foreground">{t("hint")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={working || !preview} onClick={() => void download()} className={button}>
            <Download className="size-4" aria-hidden />
            {t("download")}
          </button>
          {canShare && (
            <button type="button" disabled={working || !preview} onClick={() => void share()} className={button}>
              <Share2 className="size-4" aria-hidden />
              {t("share")}
            </button>
          )}
        </div>
        {failed && <p role="alert" className="text-sm text-destructive">{t("failed")}</p>}
      </div>
    </div>
  );
}
