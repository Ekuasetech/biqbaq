"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cardClass, headingClass } from "@/components/account/account-dashboard";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listMyFavourites, setFavourite, type Favourite } from "@/modules/reviews";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/** Only appears once someone has saved something. */
export function FavouritesCard() {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const [items, setItems] = useState<Favourite[]>([]);

  const load = useCallback(async () => {
    const { data } = await listMyFavourites(getSupabaseBrowserClient());
    setItems((data ?? []) as Favourite[]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="my-favourites" className={cardClass}>
      <h2 id="my-favourites" className={headingClass}>{t("myFavourites")}</h2>
      <ul className="mt-3 grid gap-3">
        {items.map((item) => (
          <li key={item.product_id} aria-label={item.name ?? t("unavailable")} className="flex items-center gap-3">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="size-12 shrink-0 rounded-lg bg-muted" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              {item.available && item.slug ? (
                <Link href={`/products/${item.slug}`} className="break-words text-sm font-semibold underline-offset-4 hover:underline">{item.name}</Link>
              ) : (
                <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
              )}
              {item.available && item.price_minor !== null && (
                <p className="text-sm text-muted-foreground">{formatPrice({ amountMinor: item.price_minor, currency: (item.currency ?? "CAD") as "CAD" }, locale)}</p>
              )}
            </div>
            <button type="button" onClick={() => void setFavourite(getSupabaseBrowserClient(), item.product_id, false).then(load)} className={secondaryButton}>{t("remove")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
