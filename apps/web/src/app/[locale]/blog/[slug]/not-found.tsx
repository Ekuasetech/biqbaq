"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default function BlogPostNotFound() {
  const t = useTranslations("blog");
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-heading text-3xl font-extrabold">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/blog" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5")}>
        {t("backToBlog")}
      </Link>
    </div>
  );
}
