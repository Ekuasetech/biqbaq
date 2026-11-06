import { CircleAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Shows the verification label required by PRD §6.2 on seller products. */
export function SellerBadge({ verified, className }: { verified: boolean; className?: string }) {
  const t = useTranslations("seller");
  const Icon = verified ? ShieldCheck : CircleAlert;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        verified ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {verified ? t("verified") : t("unverified")}
    </span>
  );
}
