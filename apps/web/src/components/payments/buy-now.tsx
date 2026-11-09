"use client";

import type { User } from "@supabase/supabase-js";
import { ShoppingBag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Notice, primaryButton } from "@/components/account/account-dashboard";
import { Label } from "@/components/ui/label";
import { Link, usePathname } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { paymentErrorKey } from "@/modules/payment-management";

const QUANTITIES = Array.from({ length: 10 }, (_, index) => index + 1);

/**
 * "Buy now" for a product whose shop takes online payments (BD-03): one product, with a
 * quantity, paid on Stripe's secure page. The server prices it; this only starts it.
 */
export function BuyNow({ productId, className }: { productId: string; className?: string }) {
  const t = useTranslations("payments.buy");
  const tErrors = useTranslations("payments.errors");
  const locale = useLocale();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    const timer = setTimeout(() => setCancelled(new URLSearchParams(window.location.search).get("checkout") === "cancelled"), 0);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function buy() {
    if (working) return;
    setWorking(true);
    setFailure(null);
    const response = await fetch("/api/v1/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: productId, quantity, locale }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (response?.ok && body?.url) {
      window.location.assign(body.url);
      return;
    }
    setWorking(false);
    setFailure(paymentErrorKey(body?.error));
  }

  if (!user) {
    return (
      <p className={cn("text-sm", className)}>
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="font-semibold underline underline-offset-4">{t("signIn")}</Link>{" "}
        <span className="text-muted-foreground">{t("signInWhy")}</span>
      </p>
    );
  }
  return (
    <div className={cn("grid gap-2", className)}>
      {cancelled && <Notice kind="info">{t("cancelled")}</Notice>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="buy-quantity">{t("quantity")}</Label>
          <select
            id="buy-quantity"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="h-11 w-24 rounded-lg border border-input bg-card px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          >
            {QUANTITIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <button type="button" disabled={working} onClick={() => void buy()} className={cn(primaryButton, "h-11 gap-2")}>
          <ShoppingBag className="size-4" aria-hidden />
          {working ? t("working") : t("button")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      {failure && <Notice kind="error">{tErrors(failure)}</Notice>}
    </div>
  );
}
