"use client";

import type { User } from "@supabase/supabase-js";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/modules/invoicing";
import { listMyOrders, orderState, type MyOrder } from "@/modules/payment-management";

/** A buyer's orders. A new one shows as "confirming" until Stripe's notice marks it paid. */
export function MyOrders() {
  const t = useTranslations("payments.myOrders");
  const tStates = useTranslations("payments.orders.states");
  const locale = useLocale();
  const format = useFormatter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [rows, setRows] = useState<MyOrder[] | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  useEffect(() => {
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    const timer = setTimeout(() => setPlaced(new URLSearchParams(window.location.search).get("placed")), 0);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let stop = false;
    let tries = 0;
    // Just back from paying: checks a few times while Stripe's notice arrives.
    const load = async () => {
      const { data } = await listMyOrders(getSupabaseBrowserClient());
      if (stop) return;
      const next = (data ?? []) as MyOrder[];
      setRows(next);
      if (next.some((order) => order.status === "pending") && tries++ < 10) setTimeout(() => void load(), 3000);
    };
    const timer = setTimeout(() => void load(), 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [user]);

  if (user === undefined) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (!user) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <p className="text-sm text-muted-foreground">{t("signedOut")}</p>
        <Link href="/sign-in?next=/account/orders" className={cn(primaryButton, "mt-4")}>{t("signIn")}</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {placed && <Notice kind="info">{t("placed", { number: placed })}</Notice>}
      <section aria-labelledby="my-orders" className={cn(cardClass, "grid gap-3")}>
        <h2 id="my-orders" className="sr-only">{t("title")}</h2>
        {rows === null && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
        {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {rows && rows.length > 0 && (
          <ul aria-label={t("title")} className="grid gap-2">
            {rows.map((order) => {
              const state = order.status === "pending" ? "confirming" : orderState({ ...order, disputed: false });
              return (
                <li key={order.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {order.product_slug ? (
                        <Link href={`/products/${order.product_slug}`} prefetch={false} className="underline-offset-4 hover:underline">{order.product_name}</Link>
                      ) : (
                        order.product_name
                      )}{" "}
                      × {order.quantity}
                    </span>
                    <span className="block text-muted-foreground">
                      {order.number} · <Link href={`/sellers/${order.shop_slug}`} prefetch={false} className="underline-offset-4 hover:underline">{order.shop_name}</Link> ·{" "}
                      {format.dateTime(new Date(order.created_at), { dateStyle: "medium" })}
                    </span>
                  </span>
                  <span className="grid justify-items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatMoney(order.total_minor, locale)}</span>
                    <StatusPill tone={state === "delivered" ? "good" : state === "confirming" || state === "to_deliver" ? "waiting" : "neutral"}>
                      {state === "confirming" ? t("confirming") : state === "to_deliver" ? t("paid") : tStates(state)}
                    </StatusPill>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("help")}</p>
      </section>
    </div>
  );
}
