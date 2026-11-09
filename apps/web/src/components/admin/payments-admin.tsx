"use client";

import { refreshCatalog } from "@/modules/product-catalog/actions";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/modules/invoicing";
import {
  adminListOrders,
  adminListPaymentAccounts,
  adminSetSellerPayments,
  orderState,
  type AdminOrder,
  type AdminPaymentAccount,
} from "@/modules/payment-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function SearchBox({ id, label, onSearch }: { id: string; label: string; onSearch: (value: string) => void }) {
  const t = useTranslations("paymentsAdmin");
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(value.trim());
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} value={value} onChange={(event) => setValue(event.target.value)} className="h-11 text-base md:text-sm" />
      </div>
      <button type="submit" className={primaryButton}>{t("searchButton")}</button>
    </form>
  );
}

/** Super Admin switches online payments on per shop and sees how each stands (PRD §13.2). */
function Shops() {
  const t = useTranslations("paymentsAdmin");
  const tStatus = useTranslations("payments.setup.status");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminPaymentAccount[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await adminListPaymentAccounts(getSupabaseBrowserClient(), query, 1);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as AdminPaymentAccount[]);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section aria-labelledby="payment-shops" className={cn(cardClass, "grid gap-3")}>
      <h2 id="payment-shops" className={headingClass}>{t("shopsTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("shopsIntro")}</p>
      <SearchBox id="payment-shop-search" label={t("searchShops")} onSearch={setQuery} />
      {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.seller_id}>
              <article aria-label={row.shop_name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block break-words font-semibold">{row.shop_name}</span>
                  <span className="block break-all text-xs text-muted-foreground">/sellers/{row.shop_slug}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("figures", { orders: row.paid_orders, total: formatMoney(row.paid_minor, locale) })}
                    {row.has_account && ` · ${t(row.charges_enabled ? "chargesOn" : "chargesOff")} · ${t(row.payouts_enabled ? "payoutsOn" : "payoutsOff")}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={row.status === "enabled" ? "good" : row.status === "restricted" || row.status === "suspended" ? "bad" : "neutral"}>
                    {tStatus(row.status)}
                  </StatusPill>
                  <button
                    type="button"
                    onClick={async () => {
                      await adminSetSellerPayments(getSupabaseBrowserClient(), row.seller_id, !row.enabled_by_admin);
                      // Product pages show or hide "Buy now" at once.
                      await refreshCatalog().catch(() => undefined);
                      await load();
                    }}
                    className={secondaryButton}
                  >
                    {t(row.enabled_by_admin ? "turnOff" : "turnOn")}
                  </button>
                </span>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Every order, with its payment reference (PRD §13.2: "view payment references and statuses"). */
function Orders() {
  const t = useTranslations("paymentsAdmin");
  const tStates = useTranslations("payments.orders.states");
  const locale = useLocale();
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminOrder[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await adminListOrders(getSupabaseBrowserClient(), query, 1);
      setRows((data ?? []) as AdminOrder[]);
    }, 0);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <section aria-labelledby="payment-orders" className={cn(cardClass, "grid gap-3")}>
      <h2 id="payment-orders" className={headingClass}>{t("ordersTitle")}</h2>
      <SearchBox id="payment-order-search" label={t("searchOrders")} onSearch={setQuery} />
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("noOrders")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-2">
          {rows.map((order) => (
            <li key={order.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{order.number} · {order.product_name}</span>
                <span className="block break-all text-xs text-muted-foreground">
                  {order.shop_name} · {order.buyer_email} · {format.dateTime(new Date(order.created_at), { dateStyle: "medium" })}
                </span>
                {order.provider_payment_id && <span className="block break-all font-mono text-xs text-muted-foreground">{order.provider_payment_id}</span>}
              </span>
              <span className="grid justify-items-end gap-1">
                <span className="tabular-nums">{formatMoney(order.total_minor, locale)} <span className="text-xs text-muted-foreground">({t("fee", { fee: formatMoney(order.application_fee_minor, locale) })})</span></span>
                <StatusPill tone="neutral">{order.status === "paid" ? tStates(orderState({ ...order, fulfilled_at: null })) : t(`orderStatus.${order.status}`)}</StatusPill>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PaymentsAdmin() {
  return (
    <div className="grid gap-4">
      <Shops />
      <Orders />
    </div>
  );
}
