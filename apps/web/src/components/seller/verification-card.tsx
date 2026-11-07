"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canRequest,
  isVerified,
  NOTE_MAX_LENGTH,
  requestVerification,
  verificationErrorKey,
  type MyVerificationRequest,
  type VerificationStatus,
} from "@/modules/verification";

const tone = (status: VerificationStatus) =>
  isVerified(status) ? "good" : status === "pending" ? "waiting" : status === "unverified" ? "neutral" : "bad";

export function VerificationCard({
  status,
  request,
  shopActive,
  onChanged,
}: {
  status: VerificationStatus;
  request: MyVerificationRequest | null;
  shopActive: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("verification");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) {
      setFailure("noteRequired");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await requestVerification(getSupabaseBrowserClient(), note);
    if (error) {
      setFailure(verificationErrorKey(error));
    } else {
      setOpen(false);
      setNote("");
      await onChanged();
    }
    setWorking(false);
  }

  return (
    <section aria-labelledby="shop-verification" className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="shop-verification" className={headingClass}>{t("cardTitle")}</h2>
        <StatusPill tone={tone(status)}>{t(`status.${status}`)}</StatusPill>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t(`explain.${status}`)}</p>
      {status === "rejected" && request?.reason && <p className="mt-2 text-sm">{t("reason", { reason: request.reason })}</p>}
      {shopActive && canRequest(status) && !open && (
        <button type="button" onClick={() => setOpen(true)} className={`${primaryButton} mt-4`}>{t("requestButton")}</button>
      )}
      {open && (
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="verification-note">{t("noteLabel")}</Label>
            <Textarea id="verification-note" value={note} maxLength={NOTE_MAX_LENGTH} rows={4} onChange={(event) => setNote(event.target.value)} className="rounded-xl" />
            <p className="text-xs text-muted-foreground">{t("noteHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("sendRequest")}</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold underline underline-offset-4">{t("cancel")}</button>
          </div>
        </form>
      )}
      {failure && <div className="mt-3"><Notice kind="error">{t(`errors.${failure}`)}</Notice></div>}
    </section>
  );
}
