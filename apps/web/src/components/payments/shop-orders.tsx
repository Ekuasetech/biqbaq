"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useScrollToHash } from "@/lib/use-scroll-to-hash";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoney } from "@/modules/invoicing";
import { addressLines, listShopOrders, orderState, paymentErrorKey, setOrderFulfilled, type ShopOrder } from "@/modules/payment-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const FILTERS = ["to_deliver", "delivered", "refunded", "all"] as const;
const TONES: Record<string, "good" | "waiting" | "bad" | "neutral"> = {
  to_deliver: "waiting",
  delivered: "good",
  partly_refunded: "neutral",
  refunded: "neutral",
  disputed: "bad",
};

function Refund({ order, onDone }: { order: ShopOrder; onDone: () => Promise<void> }) {
  const t = useTranslations("payments.orders");
  const tErrors = useTranslations("payments.errors");
  const locale = useLocale();
  const left = order.total_minor - order.refunded_minor;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((left / 100).toFixed(2));
  const [key] = useState(() => crypto.randomUUID());
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function refund(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    const minor = parseMoney(amount);
    if (minor === null || minor < 1 || minor > left) {
      setFailure("AMOUNT_INVALID");
      return;
    }
    setWorking(true);
    setFailure(null);
    const response = await fetch(`/api/v1/orders/${order.id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount_minor: minor, key }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setWorking(false);
    if (!response?.ok) {
      setFailure(paymentErrorKey(body?.error));
      return;
    }
    setOpen(false);
    await onDone();
  }

  if (left <= 0) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>{t("refund")}</button>;
  const field = `refund-${order.id}`;
  return (
    <form onSubmit={refund} noValidate className="grid w-full gap-2 rounded-xl bg-muted/50 p-3">
      <Label htmlFor={field}>{t("refundAmount", { left: formatMoney(left, locale) })}</Label>
      <Input id={field} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 max-w-40 text-base md:text-sm" />
      <p className="text-xs text-muted-foreground">{t("refundHint", { fee: formatMoney(order.application_fee_minor, locale) })}</p>
      {failure && <Notice kind="error">{tErrors(failure)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{working ? t("working") : t("confirmRefund")}</button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

/** A shop's paid orders (PRD §13.4), for its owner and staff with "Manage orders". */
export function ShopOrders({ sellerId }: { sellerId: string }) {
  const t = useTranslations("payments.orders");
  const locale = useLocale();
  const format = useFormatter();
  const [filter, setFilter] = useState<string>("to_deliver");
  const [rows, setRows] = useState<ShopOrder[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await listShopOrders(getSupabaseBrowserClient(), sellerId, filter, 1);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data as ShopOrder[]);
  }, [sellerId, filter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useScrollToHash(rows !== null);

  return (
    <section aria-labelledby="shop-orders" className={cn(cardClass, "grid gap-4")}>
      <h2 id="shop-orders" className="sr-only">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div role="tablist" aria-label={t("filter")} className="flex flex-wrap gap-2">
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={filter === name}
            onClick={() => setFilter(name)}
            className={cn(secondaryButton, filter === name && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
          >
            {t(`filters.${name}`)}
          </button>
        ))}
      </div>
      {failed && <Notice kind="error">{t("loadFailed")}</Notice>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul aria-label={t("title")} className="grid gap-3">
          {rows.map((order) => {
            const state = orderState(order);
            return (
              <li key={order.id} id={`order-${order.id}`} className="scroll-mt-24">
                <article aria-label={order.number} className="grid gap-3 rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        {order.number} · {order.product_name} × {order.quantity}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(order.total_minor, locale)} · {order.paid_at ? format.dateTime(new Date(order.paid_at), { dateStyle: "medium", timeStyle: "short" }) : ""}
                        {order.refunded_minor > 0 && ` · ${t("refunded", { amount: formatMoney(order.refunded_minor, locale) })}`}
                      </p>
                    </div>
                    <StatusPill tone={TONES[state] ?? "neutral"}>{t(`states.${state}`)}</StatusPill>
                  </div>
                  <div className="grid gap-0.5 text-sm">
                    <p className="font-medium">{t("deliverTo")}</p>
                    <p className="break-words">{order.shipping_name}</p>
                    {addressLines(order.shipping_address).map((line) => <p key={line} className="break-words text-muted-foreground">{line}</p>)}
                    <p className="break-words text-muted-foreground">{[order.shipping_phone, order.buyer_email].filter(Boolean).join(" · ")}</p>
                  </div>
                  {order.disputed && <Notice kind="error">{t("disputed")}</Notice>}
                  <div className="flex flex-wrap gap-2">
                    {state !== "refunded" && (
                      <button
                        type="button"
                        onClick={async () => {
                          await setOrderFulfilled(getSupabaseBrowserClient(), order.id, !order.fulfilled_at);
                          await load();
                        }}
                        className={secondaryButton}
                      >
                        {t(order.fulfilled_at ? "notDelivered" : "markDelivered")}
                      </button>
                    )}
                    <Refund order={order} onDone={load} />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
