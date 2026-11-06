"use client";

import { Check, Link2, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

export function ShareButtons({ title }: { title: string }) {
  const t = useTranslations("share");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // False during server render, so markup matches until the browser takes over.
  const canNativeShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
  const url = useSyncExternalStore(noSubscribe, () => window.location.href, () => "");

  const encodedUrl = encodeURIComponent(url);
  const linkClass = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">{t("title")}</h2>
      <div className="flex flex-wrap gap-2">
        <a className={linkClass} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(title)}%20${encodedUrl}`}>
          <MessageCircle aria-hidden /> {t("whatsapp")}
        </a>
        <a className={linkClass} target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}>
          <ThumbsUp aria-hidden /> {t("facebook")}
        </a>
        <Button variant="outline" size="lg" className="h-10" onClick={copy}>
          {copyState === "copied" ? <Check aria-hidden /> : <Link2 aria-hidden />}
          <span aria-live="polite">
            {copyState === "copied" ? t("copied") : copyState === "failed" ? t("copyFailed") : t("copy")}
          </span>
        </Button>
        {canNativeShare && (
          <Button
            variant="outline"
            size="lg"
            className="h-10"
            onClick={() => navigator.share({ title, url }).catch(() => undefined)}
          >
            <Share2 aria-hidden /> {t("native")}
          </Button>
        )}
      </div>
    </div>
  );
}
