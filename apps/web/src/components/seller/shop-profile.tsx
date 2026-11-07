"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { cardClass, headingClass, Notice, primaryButton } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMyContactInformation, shopProfileErrorKey, shopProfileSchema, updateMyShop, type MyShop } from "@/modules/seller-management";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70";
const inputClass = "h-11 text-base md:text-sm";

type Fields = "name" | "city" | "category" | "description" | "contact_information";

/** Checking the shop's status here only decides what shows. The database enforces who can edit. */
export function ShopProfile({ shop, categorySlugs, onSaved }: { shop: MyShop; categorySlugs: string[]; onSaved: () => Promise<void> }) {
  const t = useTranslations("shop");
  const tCategories = useTranslations("categories");
  const [contact, setContact] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);

  async function open() {
    setOpening(true);
    setFailure(null);
    setSaved(false);
    const { data, error } = await getMyContactInformation(getSupabaseBrowserClient(), shop.id);
    setOpening(false);
    if (error) setFailure("generic");
    else setContact(data?.contact_information ?? "");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setFailure(null);
    const parsed = shopProfileSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      const next: Partial<Record<Fields, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Fields] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    const { error } = await updateMyShop(getSupabaseBrowserClient(), parsed.data);
    if (error) {
      setSaving(false);
      setFailure(shopProfileErrorKey(error));
      return;
    }
    await onSaved();
    setSaving(false);
    setContact(null);
    setSaved(true);
  }

  const field = (name: Fields) => ({
    id: `shop-${name}`,
    name,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `shop-${name}-error` : undefined,
  });
  const problem = (name: Fields) =>
    errors[name] && <p id={`shop-${name}-error`} className="text-sm text-destructive">{t(`errors.${errors[name]}`)}</p>;

  return (
    <section aria-labelledby="shop-details" className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="shop-details" className={headingClass}>{t("profile.title")}</h2>
        {contact === null && (
          <button type="button" disabled={opening} onClick={() => void open()} className={secondaryButton}>{t("profile.edit")}</button>
        )}
      </div>
      <div className="mt-3 grid gap-3">
        {saved && <Notice kind="info">{t("profile.saved")}</Notice>}
        {failure && <Notice kind="error">{t(`errors.${failure}`)}</Notice>}
        {contact === null ? (
          <>
            {shop.category && <p className="text-sm font-semibold">{tCategories(shop.category)}</p>}
            <p className="whitespace-pre-line text-sm text-muted-foreground">{shop.description}</p>
          </>
        ) : (
          <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2" aria-label={t("profile.title")}>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-name">{t("profile.name")}</Label>
              <Input {...field("name")} defaultValue={shop.name} maxLength={150} className={inputClass} />
              {problem("name")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-city">{t("profile.city")}</Label>
              <Input {...field("city")} defaultValue={shop.city} maxLength={100} autoComplete="address-level2" className={inputClass} />
              {problem("city")}
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="shop-category">{t("profile.category")}</Label>
              <select {...field("category")} defaultValue={shop.category ?? ""} className="h-11 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{t("fields.noCategory")}</option>
                {categorySlugs.map((slug) => <option key={slug} value={slug}>{tCategories(slug)}</option>)}
              </select>
              {problem("category")}
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="shop-description">{t("profile.description")}</Label>
              <Textarea {...field("description")} defaultValue={shop.description} rows={4} maxLength={1000} />
              {problem("description")}
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="shop-contact_information">{t("profile.contact")}</Label>
              <Input {...field("contact_information")} defaultValue={contact} maxLength={200} className={inputClass} />
              <p className="text-xs text-muted-foreground">{t("profile.contactHint")}</p>
              {problem("contact_information")}
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("profile.publicHint")}</p>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? t("saving") : t("save")}</button>
              <button type="button" onClick={() => { setContact(null); setErrors({}); setFailure(null); }} className={secondaryButton}>{t("cancel")}</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
