"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default function SellerNotFound() {
  const t = useTranslations("seller");
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-heading text-3xl font-extrabold">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/products" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5")}>
        {t("browseProducts")}
      </Link>
    </div>
  );
}
