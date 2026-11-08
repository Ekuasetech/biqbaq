"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cardClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type State = "loading" | "invalid" | "ready" | "working" | "done" | "failed";

/** The page a confirmation or unsubscribe link opens. Nothing changes until the button is pressed. */
export function ListLinkPage({ action }: { action: "confirm" | "unsubscribe" }) {
  const t = useTranslations("emailLink");
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<State>("loading");
  const [sender, setSender] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/email/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState("invalid");
        const body = (await response.json()) as { sender: string; status: string };
        setSender(body.sender);
        setStatus(body.status);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("failed");
      });
    return () => controller.abort();
  }, [token]);

  async function go() {
    setState("working");
    const response = await fetch(`/api/v1/email/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    if (!response?.ok) return setState("failed");
    const body = (await response.json()) as { status: string };
    setStatus(body.status);
    setState("done");
  }

  let content;
  if (state === "loading") content = <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  else if (state === "invalid") content = <Notice kind="error">{t("invalid")}</Notice>;
  else if (state === "failed") content = <Notice kind="error">{t("failed")}</Notice>;
  else if (action === "confirm" && status === "unsubscribed") content = <p>{t("confirm.unsubscribed", { sender })}</p>;
  else if (action === "confirm" && status === "confirmed") content = <p role="status">{t("confirm.done", { sender })}</p>;
  else if (action === "unsubscribe" && status === "unsubscribed") content = <p role="status">{t("unsubscribe.done", { sender })}</p>;
  else
    content = (
      <>
        <p>{t(`${action}.question`, { sender })}</p>
        <button type="button" disabled={state === "working"} onClick={() => void go()} className={cn(primaryButton, "mt-4")}>
          {t(`${action}.button`)}
        </button>
      </>
    );

  return (
    <div className={cn(cardClass, "mx-auto max-w-lg")}>
      {content}
      <p className="mt-6 text-sm">
        <Link href="/" className="underline underline-offset-4">{t("home")}</Link>
      </p>
    </div>
  );
}
